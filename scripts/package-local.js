const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const outputDirectory = path.join(root, "dist", "packages");

function sha256(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function chromiumId(publicKey) {
  const digest = crypto
    .createHash("sha256")
    .update(Buffer.from(publicKey, "base64"))
    .digest()
    .subarray(0, 16);
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .replace(/[0-9a-f]/g, (value) =>
      String.fromCharCode(97 + Number.parseInt(value, 16)),
    );
}

function packageTarget(target, fileName) {
  const source = path.join(root, "dist", target);
  const manifestPath = path.join(source, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${target} build; run pnpm build:${target} first`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.version !== packageJson.version || manifest.name !== "Fdial") {
    throw new Error(`Unexpected ${target} manifest identity`);
  }

  const output = path.join(outputDirectory, fileName);
  fs.rmSync(output, { force: true });
  execFileSync("zip", ["-q", "-9", "-r", output, "."], {
    cwd: source,
    stdio: "inherit",
  });
  return { manifest, output };
}

fs.mkdirSync(outputDirectory, { recursive: true });
const chromium = packageTarget(
  "chromium",
  `fdial-chromium-${packageJson.version}.zip`,
);
const firefox = packageTarget(
  "firefox",
  `fdial-firefox-${packageJson.version}-unsigned.xpi`,
);
const files = [chromium.output, firefox.output].map((file) => ({
  file: path.basename(file),
  bytes: fs.statSync(file).size,
  sha256: sha256(file),
}));
const release = {
  name: "Fdial",
  version: packageJson.version,
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  builtAt: new Date().toISOString(),
  chromiumExtensionId: chromiumId(chromium.manifest.key),
  firefoxAddonId: firefox.manifest.browser_specific_settings.gecko.id,
  firefoxSigned: false,
  files,
};
fs.writeFileSync(
  path.join(outputDirectory, "release.json"),
  `${JSON.stringify(release, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(outputDirectory, "SHA256SUMS"),
  `${files.map(({ file, sha256: hash }) => `${hash}  ${file}`).join("\n")}\n`,
);
console.log(JSON.stringify(release, null, 2));

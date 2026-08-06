import "./FontFamilyPicker.sass";

import { type ChangeEvent, type FC, useState } from "react";
import {
  defineMessages,
  FormattedMessage,
  type MessageDescriptor,
  useIntl,
} from "react-intl";

import { MAX_LOCAL_FONTS } from "../../fonts/model";
import { type FontPreset, fontPresets } from "../../fonts/presets";
import {
  addLocalFont,
  LocalFontError,
  removeLocalFont,
} from "../../fonts/store";
import { useLocalFonts } from "../../fonts/useLocalFonts";
import { parseFontFamilyAndFeatures } from "../../utils";

const messages = defineMessages({
  system: {
    id: "settings.font.preset.system",
    defaultMessage: "System UI",
    description: "System UI font preset",
  },
  humanist: {
    id: "settings.font.preset.humanist",
    defaultMessage: "Humanist sans",
    description: "Humanist sans-serif font preset",
  },
  serif: {
    id: "settings.font.preset.serif",
    defaultMessage: "Classic serif",
    description: "Serif font preset",
  },
  mono: {
    id: "settings.font.preset.mono",
    defaultMessage: "Monospace",
    description: "Monospace font preset",
  },
  rounded: {
    id: "settings.font.preset.rounded",
    defaultMessage: "Rounded sans",
    description: "Rounded sans-serif font preset",
  },
  display: {
    id: "settings.font.preset.display",
    defaultMessage: "Display",
    description: "Display font preset",
  },
  invalidType: {
    id: "settings.font.local.invalidType",
    defaultMessage: "Choose a WOFF2, WOFF, TTF or OTF font file.",
    description: "Unsupported local font file error",
  },
  tooLarge: {
    id: "settings.font.local.tooLarge",
    defaultMessage: "Font files must be 6 MiB or smaller.",
    description: "Oversized local font file error",
  },
  tooMany: {
    id: "settings.font.local.tooMany",
    defaultMessage: "Up to {count} local fonts can be stored.",
    description: "Local font count limit error",
  },
  uploadFailed: {
    id: "settings.font.local.uploadFailed",
    defaultMessage: "Could not store that local font.",
    description: "Local font upload failure",
  },
  removeFailed: {
    id: "settings.font.local.removeFailed",
    defaultMessage: "Could not remove that local font.",
    description: "Local font removal failure",
  },
  customPlaceholder: {
    id: "settings.font.customPlaceholder",
    defaultMessage: 'Cambria:smcp&onum or "Inter", sans-serif',
    description: "Custom CSS font family example",
  },
});

const presetMessages: Record<FontPreset["id"], MessageDescriptor> = {
  system: messages.system,
  humanist: messages.humanist,
  serif: messages.serif,
  mono: messages.mono,
  rounded: messages.rounded,
  display: messages.display,
};

type Props = {
  value?: string;
  onChange: (value: string | undefined) => void;
};

const CUSTOM_VALUE = "__custom__";

const FontFamilyPicker: FC<Props> = ({ value = "", onChange }) => {
  const intl = useIntl();
  const { error: libraryError, fonts, loading } = useLocalFonts();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const knownFamilies = new Set([
    ...fontPresets.map(({ family }) => family),
    ...fonts.map(({ family }) => family),
  ]);
  const selection = value
    ? knownFamilies.has(value)
      ? value
      : CUSTOM_VALUE
    : "";
  const parsed = parseFontFamilyAndFeatures(value);

  const fontError = (cause: unknown, fallback: MessageDescriptor): string => {
    if (cause instanceof LocalFontError) {
      if (cause.code === "invalid-type") {
        return intl.formatMessage(messages.invalidType);
      }
      if (cause.code === "too-large") {
        return intl.formatMessage(messages.tooLarge);
      }
      return intl.formatMessage(messages.tooMany, {
        count: MAX_LOCAL_FONTS,
      });
    }
    return intl.formatMessage(fallback);
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setWorking(true);
    setError(undefined);
    try {
      const record = await addLocalFont(file);
      onChange(record.family);
    } catch (cause) {
      setError(fontError(cause, messages.uploadFailed));
    } finally {
      setWorking(false);
    }
  };

  const remove = async (id: string, family: string) => {
    setWorking(true);
    setError(undefined);
    try {
      await removeLocalFont(id);
      if (value === family) onChange(undefined);
    } catch (cause) {
      setError(fontError(cause, messages.removeFailed));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="FontFamilyPicker">
      <label>
        <FormattedMessage
          id="settings.font.family"
          defaultMessage="Font"
          description="Font title"
        />
        <select
          value={selection}
          disabled={loading || working}
          onChange={(event) => {
            if (event.target.value !== CUSTOM_VALUE) {
              onChange(event.target.value || undefined);
            }
          }}
        >
          <option value="">
            <FormattedMessage
              id="settings.font.inherit"
              defaultMessage="Default / inherited"
              description="Default inherited font option"
            />
          </option>
          <optgroup
            label={intl.formatMessage({
              id: "settings.font.builtIn",
              defaultMessage: "Built-in choices",
              description: "Built-in font preset group",
            })}
          >
            {fontPresets.map((preset) => (
              <option value={preset.family} key={preset.id}>
                {intl.formatMessage(presetMessages[preset.id])}
              </option>
            ))}
          </optgroup>
          {fonts.length > 0 && (
            <optgroup
              label={intl.formatMessage({
                id: "settings.font.localGroup",
                defaultMessage: "Local uploads",
                description: "Local uploaded fonts option group",
              })}
            >
              {fonts.map((font) => (
                <option value={font.family} key={font.id}>
                  {font.name}
                </option>
              ))}
            </optgroup>
          )}
          <option value={CUSTOM_VALUE}>
            {intl.formatMessage({
              id: "settings.font.custom",
              defaultMessage: "Custom CSS family / OpenType",
              description: "Custom font family option",
            })}
          </option>
        </select>
      </label>

      <label>
        <FormattedMessage
          id="settings.font.customValue"
          defaultMessage="Custom family value"
          description="Custom CSS font family field"
        />
        <input
          type="text"
          value={value}
          placeholder={intl.formatMessage(messages.customPlaceholder)}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      </label>

      <div
        className="FontFamilyPicker__preview"
        style={{ fontFamily: parsed.family, ...parsed.style }}
      >
        <FormattedMessage
          id="settings.font.preview"
          defaultMessage="Aa Bb 0123 — The quick brown fox"
          description="Font preview sample"
        />
      </div>

      <label className="FontFamilyPicker__upload">
        <FormattedMessage
          id="settings.font.upload"
          defaultMessage="Upload local font"
          description="Local font upload field"
        />
        <input
          type="file"
          accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
          disabled={working || fonts.length >= MAX_LOCAL_FONTS}
          onChange={(event) => void upload(event)}
        />
      </label>
      <p className="info">
        <FormattedMessage
          id="settings.font.localPrivacy"
          defaultMessage="Font files stay in local IndexedDB and are never written to browser sync."
          description="Local font storage privacy explanation"
        />
      </p>

      {fonts.length > 0 && (
        <ul className="FontFamilyPicker__library">
          {fonts.map((font) => (
            <li key={font.id}>
              <span style={{ fontFamily: font.family }}>{font.name}</span>
              <button
                type="button"
                disabled={working}
                onClick={() => void remove(font.id, font.family)}
              >
                <FormattedMessage
                  id="settings.font.remove"
                  defaultMessage="Remove"
                  description="Remove local font button"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(error || libraryError) && (
        <p className="FontFamilyPicker__error" role="status">
          {error || libraryError}
        </p>
      )}
    </div>
  );
};

export default FontFamilyPicker;

import { batch } from "./storage";

describe("storage write batching", () => {
  test("keeps only the latest value for each key", () => {
    const flushed: [string, unknown][][] = [];
    const listener = batch(
      (changes) => flushed.push([...changes] as [string, unknown][]),
      60_000,
    );
    listener(["one", 1]);
    listener(["one", 2]);
    listener(["two", 3]);
    listener.flush();
    listener.dispose();

    expect(flushed).toEqual([
      [
        ["one", 2],
        ["two", 3],
      ],
    ]);
  });

  test("can discard an older pending write when remote state wins", () => {
    const flushed: [string, unknown][][] = [];
    const listener = batch(
      (changes) => flushed.push([...changes] as [string, unknown][]),
      60_000,
    );
    listener(["layout", "local-old"]);
    listener(["theme", "local-new"]);
    listener.discard("layout");
    listener.flush();
    listener.dispose();

    expect(flushed).toEqual([[["theme", "local-new"]]]);
  });
});

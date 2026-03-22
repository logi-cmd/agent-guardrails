import { addFinding } from "./finding.js";

function normalizeDetector(detector) {
  if (typeof detector === "function") {
    return {
      name: detector.name || "anonymous-detector",
      run: detector
    };
  }

  return detector;
}

export async function runDetectorPipeline({ detectors, context, store, t }) {
  for (const rawDetector of detectors) {
    const detector = normalizeDetector(rawDetector);
    await detector.run({
      context,
      t,
      addFinding: (finding) => addFinding(store, finding)
    });
  }

  return store;
}

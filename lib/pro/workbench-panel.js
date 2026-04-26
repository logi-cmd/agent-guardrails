function asArray(value = []) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function compactString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function clampProgress(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeAction(action = {}) {
  const id = compactString(action.id || action.intent || action.label);
  if (!id) return null;
  return {
    id,
    label: compactString(action.label || action.intent || action.id) || "Action",
    intent: compactString(action.intent),
    type: compactString(action.type) || "action",
    command: compactString(action.command),
    value: compactString(action.value),
    enabled: action.enabled !== false,
    placement: compactString(action.placement) || "secondary",
    requiresUserApproval: Boolean(action.requiresUserApproval)
  };
}

function normalizeRows(rows = []) {
  return asArray(rows)
    .map(row => ({
      label: compactString(row.label || row.key || row.id) || "Value",
      value: compactString(row.value ?? row.text ?? row.summary) || ""
    }))
    .filter(row => row.label || row.value);
}

function normalizeSectionItem(item = {}) {
  return {
    title: compactString(item.title || item.code || item.id) || "Item",
    code: compactString(item.code),
    status: compactString(item.status || item.state),
    command: compactString(item.command),
    surface: compactString(item.surface),
    expectedEvidence: compactString(item.expectedEvidence || item.summary || item.value)
  };
}

function normalizeSection(section = {}) {
  const id = compactString(section.id || section.type || section.title);
  if (!id) return null;
  const actions = asArray(section.actions).map(normalizeAction).filter(Boolean);
  return {
    id,
    title: compactString(section.title || section.id) || "Section",
    type: compactString(section.type) || "section",
    status: compactString(section.status || section.state),
    summary: compactString(section.summary || section.description),
    target: compactString(section.target),
    command: compactString(section.command),
    rows: normalizeRows(section.rows),
    items: asArray(section.items).map(normalizeSectionItem).filter(Boolean),
    actions
  };
}

function normalizeNavCard(card = {}) {
  const id = compactString(card.id || card.title);
  if (!id) return null;
  return {
    id,
    label: compactString(card.title || card.id) || "Card",
    value: compactString(card.value) || "",
    state: compactString(card.state),
    description: compactString(card.description || card.summary),
    progress: clampProgress(card.progress)
  };
}

function findAction(actions = [], predicate) {
  return asArray(actions).find(predicate) || null;
}

function firstSentence(value) {
  const text = compactString(value);
  if (!text) return null;
  const sentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  return sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence;
}

function joinParts(parts = [], separator = " | ") {
  return parts.map(compactString).filter(Boolean).join(separator);
}

function renderStatusStrip(cards = []) {
  const values = asArray(cards).slice(0, 4).map(card => {
    const state = card.state ? `/${card.state}` : "";
    const progress = typeof card.progress === "number" ? ` ${card.progress}%` : "";
    return `${card.label}: ${card.value}${state}${progress}`.trim();
  });
  return values.length > 0 ? values.join("  |  ") : "No status cards yet";
}

function renderSectionSummary(section = {}) {
  const pieces = [
    section.status ? `[${section.status}]` : null,
    section.title,
    firstSentence(section.summary)
  ];
  return joinParts(pieces, " | ");
}

export function buildWorkbenchPanelModel(view = null, { locale = null } = {}) {
  if (!view || typeof view !== "object") return null;

  const decision = view.decision || {};
  const primaryActions = asArray(view.primaryActions).map(normalizeAction).filter(Boolean);
  const sections = asArray(view.sections).map(normalizeSection).filter(Boolean);
  const navCards = asArray(view.navigation).map(normalizeNavCard).filter(Boolean);
  const agentLoop = view.agentLoop || {};
  const nextLoopPackage = agentLoop.nextLoopPackage || {};
  const nextProofSection = sections.find(section => section.id === "next-proof") || null;
  const executeAction = findAction(primaryActions, action =>
    action.intent === "execute_next_proof" || action.intent === "execute_proof_command" || Boolean(action.command)
  ) || findAction(nextProofSection?.actions, action => Boolean(action.command));
  const handoffAction = findAction(primaryActions, action => action.intent === "handoff_to_agent");

  return {
    format: "agent-guardrails-workbench-panel.v1",
    schemaVersion: 1,
    sourceFormat: compactString(view.format) || "agent-guardrails-workbench-view.v1",
    locale: compactString(locale) || "en",
    renderer: "native-panel-model",
    generatedFor: ["desktop-app", "native-panel", "mcp-client", "terminal-ui"],
    displayRules: {
      primarySurface: compactString(view.renderHints?.primarySurface) || "native-panel",
      density: compactString(view.renderHints?.density) || "compact",
      tone: compactString(view.renderHints?.tone || decision.state) || "unknown",
      avoid: asArray(view.renderHints?.avoid).map(String),
      rawJsonIsSupportingDetail: true,
      htmlIsLegacyFallback: true
    },
    hero: {
      question: compactString(decision.question || view.headline) || "Can I ship this change?",
      answer: compactString(decision.answer || decision.verdict) || "Unknown",
      title: compactString(decision.title) || "Decision",
      state: compactString(decision.state || decision.verdict) || "unknown",
      riskLabel: compactString(decision.riskLabel || decision.riskTier),
      mergeGate: compactString(decision.mergeGate),
      trustScore: typeof decision.trustScore === "number" ? decision.trustScore : null,
      reason: compactString(decision.reason || view.summary)
    },
    statusStrip: navCards,
    nextStep: {
      label: compactString(executeAction?.label || nextProofSection?.title) || "Next step",
      command: compactString(nextLoopPackage.nextCommand || executeAction?.command || nextProofSection?.command),
      intent: compactString(executeAction?.intent) || "execute_next_proof",
      summary: compactString(executeAction?.value || nextProofSection?.summary),
      rerunCommand: compactString(nextLoopPackage.rerunCommand || agentLoop.rerunCommand),
      evidenceTool: compactString(agentLoop.evidenceCapture?.tool || nextLoopPackage.evidenceCapture?.tool)
    },
    handoff: {
      label: compactString(handoffAction?.label) || "Copy agent handoff",
      intent: compactString(handoffAction?.intent) || "handoff_to_agent",
      brief: compactString(handoffAction?.value || nextLoopPackage.agentBrief),
      humanRole: compactString(agentLoop.humanRole),
      humanChecks: asArray(agentLoop.humanChecks).map(String),
      stopConditions: asArray(agentLoop.stopConditions).map(String)
    },
    actions: primaryActions,
    sections,
    motion: {
      principle: compactString(view.renderHints?.motion?.principle) || "Use calm state transitions; do not animate raw logs.",
      transitions: asArray(view.renderHints?.motion?.transitions).map(String)
    },
    emptyStates: asArray(view.renderHints?.emptyStates),
    legacy: {
      htmlRenderer: compactString(view.legacy?.htmlRenderer),
      status: compactString(view.legacy?.status) || "compatibility_only"
    }
  };
}

export function renderWorkbenchPanelText(panel = null) {
  if (!panel || typeof panel !== "object") {
    return "Agent Guardrails Workbench\nNo panel model is available yet.";
  }

  const hero = panel.hero || {};
  const nextStep = panel.nextStep || {};
  const handoff = panel.handoff || {};
  const sections = asArray(panel.sections).slice(0, 4);
  const header = joinParts([
    "Agent Guardrails Workbench",
    hero.state ? hero.state.toUpperCase() : null,
    hero.riskLabel
  ]);
  const lines = [
    header,
    "=".repeat(Math.min(72, Math.max(32, header.length))),
    `${hero.question || "Can I ship this change?"} ${hero.answer ? `-> ${hero.answer}` : ""}`.trim(),
    hero.reason ? `Reason: ${firstSentence(hero.reason)}` : null,
    typeof hero.trustScore === "number" ? `Trust score: ${hero.trustScore}` : null,
    panel.statusStrip?.length ? `Status: ${renderStatusStrip(panel.statusStrip)}` : null,
    "",
    "Next step",
    "-".repeat(9),
    nextStep.label ? `Action: ${nextStep.label}` : null,
    nextStep.summary ? `Why: ${firstSentence(nextStep.summary)}` : null,
    nextStep.command ? `$ ${nextStep.command}` : null,
    nextStep.rerunCommand ? `Then rerun: ${nextStep.rerunCommand}` : null,
    nextStep.evidenceTool ? `Evidence tool: ${nextStep.evidenceTool}` : null,
    "",
    "Agent handoff",
    "-".repeat(13),
    handoff.label ? `Action: ${handoff.label}` : null,
    handoff.humanRole ? `Human role: ${firstSentence(handoff.humanRole)}` : null,
    handoff.humanChecks?.length ? `Check: ${handoff.humanChecks.slice(0, 2).join(" | ")}` : null,
    handoff.stopConditions?.length ? `Stop if: ${handoff.stopConditions.slice(0, 2).join(" | ")}` : null,
    "",
    "Sections",
    "-".repeat(8),
    ...sections.map(section => `- ${renderSectionSummary(section)}`)
  ];

  return lines.filter(line => line !== null).join("\n").trimEnd();
}

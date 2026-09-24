export type ParamValue =
  | { kind: "text"; text: string; refs: string[] }
  | { kind: "bool"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "table"; columns: string[]; rows: ParamValue[][] }
  | { kind: "list"; items: ParamValue[] };

export interface Param {
  key: string;
  label: string;
  value: ParamValue;
}

export interface Condition {
  left: string;
  /** Variable id of the left operand, when it is a variable. */
  leftRef?: string;
  operator: string;
  code: string;
  negate: boolean;
  right: string;
}

export interface GtmTrigger {
  id: string;
  index: number;
  name: string;
  type: string;
  icon: string;
  exportType: string;
  eventName?: string;
  /** Custom-event regex, when the event itself is matched by regex. */
  eventRegex?: string;
  conditions: Condition[];
  listener?: { fn: string; params: Param[] };
  uniqueTriggerId?: string;
  firesTags: string[];
  blocksTags: string[];
  variablesUsed: string[];
  unused: boolean;
  summary: string;
}

export interface GtmTag {
  id: string;
  index: number;
  tagId?: number;
  fn: string;
  name: string;
  type: string;
  group: string;
  icon: string;
  vendor?: string;
  paused: boolean;
  params: Param[];
  identifiers: { label: string; value: string }[];
  summary?: string;
  html?: string;
  ids: string[];
  firingTriggers: string[];
  blockingTriggers: string[];
  priority?: number;
  firingOption: "Once per event" | "Once per page" | "Unlimited";
  setupTag?: { tag: string; stopOnFailure: boolean };
  teardownTag?: { tag: string; stopOnFailure: boolean };
  consent: string[];
  variablesUsed: string[];
}

export interface GtmVariable {
  id: string;
  index: number;
  fn: string;
  name: string;
  type: string;
  icon: string;
  builtIn: boolean;
  value: string;
  params: Param[];
  description?: string;
  usedBy: { tags: string[]; triggers: string[]; variables: string[] };
  unused: boolean;
}

export interface DestinationGroup {
  name: string;
  icon: string;
  tagCount: number;
  pausedCount: number;
  ids: { label: string; id: string }[];
  tagsWithoutId: number;
  tags: string[];
}

export interface TypeCount {
  type: string;
  icon: string;
  count: number;
}

export interface GtmContainer {
  kind: "gtm";
  id: string;
  version?: string;
  fetchedAt: string;
  sourceUrl: string;
  weightBytes: number;
  weightLabel: "Light" | "Medium" | "Heavy";
  tags: GtmTag[];
  triggers: GtmTrigger[];
  variables: GtmVariable[];
  destinations: DestinationGroup[];
  ids: string[];
  listenerCount: number;
  stats: {
    active: number;
    paused: number;
    tagsWithoutTrigger: number;
    unusedTriggers: number;
    unusedVariables: number;
    customCode: number;
    tagsByType: TypeCount[];
    triggersByType: TypeCount[];
    variablesByType: TypeCount[];
  };
}

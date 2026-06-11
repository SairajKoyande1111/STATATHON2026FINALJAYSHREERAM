export type MitigationLevel = "Stops" | "Partial" | "Fails" | "N/A";

export interface MatrixRow {
  technique: string;
  family: string;
  attacks: {
    prosecutor: MitigationLevel;
    journalist: MitigationLevel;
    marketer: MitigationLevel;
    singlingOut: MitigationLevel;
    recordLinkage: MitigationLevel;
    inference: MitigationLevel;
    attrDisclosure: MitigationLevel;
    differencing: MitigationLevel;
    membership: MitigationLevel;
    modelInversion: MitigationLevel;
  };
}

export const ATTACK_MATRIX: MatrixRow[] = [
  {
    technique: "K-Anonymity", family: "SDC",
    attacks: { prosecutor: "Stops", journalist: "Stops", marketer: "Partial", singlingOut: "Stops", recordLinkage: "Stops", inference: "Fails", attrDisclosure: "Fails", differencing: "Fails", membership: "Fails", modelInversion: "Fails" },
  },
  {
    technique: "L-Diversity", family: "SDC",
    attacks: { prosecutor: "Stops", journalist: "Stops", marketer: "Stops", singlingOut: "Stops", recordLinkage: "Stops", inference: "Partial", attrDisclosure: "Stops", differencing: "Fails", membership: "Fails", modelInversion: "Fails" },
  },
  {
    technique: "T-Closeness", family: "SDC",
    attacks: { prosecutor: "Stops", journalist: "Stops", marketer: "Stops", singlingOut: "Stops", recordLinkage: "Stops", inference: "Stops", attrDisclosure: "Stops", differencing: "Fails", membership: "Fails", modelInversion: "Fails" },
  },
  {
    technique: "Rank Swapping", family: "SDC",
    attacks: { prosecutor: "Partial", journalist: "Partial", marketer: "Partial", singlingOut: "Partial", recordLinkage: "Stops", inference: "Partial", attrDisclosure: "Partial", differencing: "Fails", membership: "Fails", modelInversion: "Fails" },
  },
  {
    technique: "Microaggregation", family: "SDC",
    attacks: { prosecutor: "Partial", journalist: "Partial", marketer: "Partial", singlingOut: "Partial", recordLinkage: "Partial", inference: "Fails", attrDisclosure: "Partial", differencing: "Partial", membership: "Fails", modelInversion: "Fails" },
  },
  {
    technique: "PRAM", family: "SDC",
    attacks: { prosecutor: "Partial", journalist: "Partial", marketer: "Partial", singlingOut: "Partial", recordLinkage: "Partial", inference: "Partial", attrDisclosure: "Partial", differencing: "Partial", membership: "Fails", modelInversion: "Fails" },
  },
  {
    technique: "Top/Bottom Coding", family: "SDC",
    attacks: { prosecutor: "Partial", journalist: "Partial", marketer: "Fails", singlingOut: "Partial", recordLinkage: "Partial", inference: "Fails", attrDisclosure: "Fails", differencing: "Partial", membership: "Fails", modelInversion: "Fails" },
  },
  {
    technique: "Laplace DP", family: "Differential Privacy",
    attacks: { prosecutor: "Stops", journalist: "Stops", marketer: "Stops", singlingOut: "Stops", recordLinkage: "Stops", inference: "Stops", attrDisclosure: "Stops", differencing: "Stops", membership: "Stops", modelInversion: "Stops" },
  },
  {
    technique: "Gaussian DP", family: "Differential Privacy",
    attacks: { prosecutor: "Stops", journalist: "Stops", marketer: "Stops", singlingOut: "Stops", recordLinkage: "Stops", inference: "Stops", attrDisclosure: "Stops", differencing: "Stops", membership: "Stops", modelInversion: "Stops" },
  },
  {
    technique: "Exponential Mechanism", family: "Differential Privacy",
    attacks: { prosecutor: "Stops", journalist: "Stops", marketer: "Stops", singlingOut: "Stops", recordLinkage: "Stops", inference: "Stops", attrDisclosure: "Stops", differencing: "Stops", membership: "Stops", modelInversion: "Stops" },
  },
  {
    technique: "Statistical SDG", family: "Synthetic Data",
    attacks: { prosecutor: "Partial", journalist: "Partial", marketer: "Partial", singlingOut: "Partial", recordLinkage: "Partial", inference: "Partial", attrDisclosure: "Partial", differencing: "Partial", membership: "Partial", modelInversion: "Partial" },
  },
  {
    technique: "DP-SDG", family: "Synthetic Data",
    attacks: { prosecutor: "Stops", journalist: "Stops", marketer: "Stops", singlingOut: "Stops", recordLinkage: "Stops", inference: "Stops", attrDisclosure: "Stops", differencing: "Stops", membership: "Stops", modelInversion: "Stops" },
  },
  {
    technique: "Homomorphic Encryption", family: "Cryptographic PETs",
    attacks: { prosecutor: "Stops", journalist: "Stops", marketer: "Stops", singlingOut: "Stops", recordLinkage: "Stops", inference: "Stops", attrDisclosure: "Stops", differencing: "Fails", membership: "Fails", modelInversion: "Fails" },
  },
  {
    technique: "SMPC", family: "Cryptographic PETs",
    attacks: { prosecutor: "Stops", journalist: "Stops", marketer: "Stops", singlingOut: "Stops", recordLinkage: "Stops", inference: "Stops", attrDisclosure: "Stops", differencing: "Stops", membership: "Stops", modelInversion: "Stops" },
  },
  {
    technique: "Federated Learning (FedAvg)", family: "Federated Learning",
    attacks: { prosecutor: "Stops", journalist: "Stops", marketer: "Stops", singlingOut: "Stops", recordLinkage: "Stops", inference: "Stops", attrDisclosure: "Stops", differencing: "Stops", membership: "Stops", modelInversion: "Stops" },
  },
];

export const ATTACK_COLUMNS: { key: keyof MatrixRow["attacks"]; label: string; short: string }[] = [
  { key: "prosecutor",      label: "Prosecutor",           short: "Pros." },
  { key: "journalist",      label: "Journalist",           short: "Jour." },
  { key: "marketer",        label: "Marketer",             short: "Mkt." },
  { key: "singlingOut",     label: "Singling Out",         short: "Sgl." },
  { key: "recordLinkage",   label: "Record Linkage",       short: "Rec.L" },
  { key: "inference",       label: "Inference",            short: "Inf." },
  { key: "attrDisclosure",  label: "Attr. Disclosure",     short: "Attr." },
  { key: "differencing",    label: "Differencing",         short: "Diff." },
  { key: "membership",      label: "Membership",           short: "Memb." },
  { key: "modelInversion",  label: "Model Inversion",      short: "MI" },
];

export function countMitigations(row: MatrixRow): { stops: number; partial: number; fails: number } {
  const vals = Object.values(row.attacks) as MitigationLevel[];
  return {
    stops: vals.filter((v) => v === "Stops").length,
    partial: vals.filter((v) => v === "Partial").length,
    fails: vals.filter((v) => v === "Fails").length,
  };
}

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, jsonb, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table with roles and permissions
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull().default("analyst"), // admin, analyst, officer
  department: text("department").default(""),
  permissions: text("permissions").array().default(sql`ARRAY['data_upload', 'risk_assessment', 'privacy_enhancement', 'utility_measurement', 'report_generation']::text[]`),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  sessionTimeout: integer("session_timeout").default(30),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  lastLogin: timestamp("last_login"),
});

// Datasets table
export const datasets = pgTable("datasets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  format: text("format").notNull(),
  size: integer("size").notNull(),
  columns: text("columns").array().notNull(),
  rowCount: integer("row_count").notNull(),
  qualityScore: real("quality_score"),
  completenessScore: real("completeness_score"),
  consistencyScore: real("consistency_score"),
  validityScore: real("validity_score"),
  minGroupSize: integer("min_group_size"),
  maxGroupSize: integer("max_group_size"),
  minDiversity: integer("min_diversity"),
  maxDiversity: integer("max_diversity"),
  avgDiversity: real("avg_diversity"),
  diversityScore: real("diversity_score"),
  privacyRisk: real("privacy_risk"),
  data: jsonb("data").notNull(), // Store the actual data
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

// Risk Assessments table
export const riskAssessments = pgTable("risk_assessments", {
  id: serial("id").primaryKey(),
  datasetId: integer("dataset_id").notNull().references(() => datasets.id),
  userId: integer("user_id").notNull().references(() => users.id),
  quasiIdentifiers: text("quasi_identifiers").array().notNull(),
  sensitiveAttributes: text("sensitive_attributes").array(),
  kThreshold: integer("k_threshold").notNull().default(5),
  sampleSize: integer("sample_size").default(100),
  overallRisk: real("overall_risk").notNull(),
  riskLevel: text("risk_level").notNull(), // Low, Medium, High
  violations: integer("violations").notNull(),
  uniqueRecords: integer("unique_records").notNull(),
  equivalenceClasses: jsonb("equivalence_classes"),
  attackScenarios: jsonb("attack_scenarios"),
  recommendations: text("recommendations").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Privacy Operations table
export const privacyOperations = pgTable("privacy_operations", {
  id: serial("id").primaryKey(),
  datasetId: integer("dataset_id").notNull().references(() => datasets.id),
  userId: integer("user_id").notNull().references(() => users.id),
  technique: text("technique").notNull(), // k-anonymity, l-diversity, t-closeness, differential-privacy, synthetic-data
  method: text("method"), // global-recoding, local-recoding, clustering, distinct, entropy, laplace, gaussian
  parameters: jsonb("parameters").notNull(),
  processedData: jsonb("processed_data"),
  recordsSuppressed: integer("records_suppressed").default(0),
  informationLoss: real("information_loss"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Utility Measurements table
export const utilityMeasurements = pgTable("utility_measurements", {
  id: serial("id").primaryKey(),
  originalDatasetId: integer("original_dataset_id").notNull().references(() => datasets.id),
  processedOperationId: integer("processed_operation_id").notNull().references(() => privacyOperations.id),
  userId: integer("user_id").notNull().references(() => users.id),
  overallUtility: real("overall_utility").notNull(),
  utilityLevel: text("utility_level").notNull(), // Excellent, Good, Fair, Poor
  statisticalSimilarity: jsonb("statistical_similarity"),
  correlationPreservation: real("correlation_preservation"),
  distributionSimilarity: real("distribution_similarity"),
  informationLoss: real("information_loss"),
  queryAccuracy: jsonb("query_accuracy"),
  metrics: jsonb("metrics"),
  recommendations: text("recommendations").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reports table
export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  datasetId: integer("dataset_id").references(() => datasets.id),
  riskAssessmentId: integer("risk_assessment_id").references(() => riskAssessments.id),
  utilityMeasurementId: integer("utility_measurement_id").references(() => utilityMeasurements.id),
  type: text("type").notNull(), // executive, technical, comprehensive
  format: text("format").notNull(), // pdf, html
  title: text("title").notNull(),
  content: jsonb("content"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Privacy Configuration Profiles table
export const configProfiles = pgTable("config_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  kValue: integer("k_value").default(5),
  lValue: integer("l_value").default(3),
  tValue: real("t_value").default(0.5),
  epsilon: real("epsilon").default(2.0),
  suppressionLimit: real("suppression_limit").default(0.1),
  useCase: text("use_case"),
  recommendedFor: text("recommended_for").array(),
  governmentClearance: text("government_clearance"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Activity Logs table
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type"), // dataset, assessment, operation, report
  entityId: integer("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  datasets: many(datasets),
  riskAssessments: many(riskAssessments),
  privacyOperations: many(privacyOperations),
  utilityMeasurements: many(utilityMeasurements),
  reports: many(reports),
  activityLogs: many(activityLogs),
}));

export const datasetsRelations = relations(datasets, ({ one, many }) => ({
  user: one(users, { fields: [datasets.userId], references: [users.id] }),
  riskAssessments: many(riskAssessments),
  privacyOperations: many(privacyOperations),
  reports: many(reports),
}));

export const riskAssessmentsRelations = relations(riskAssessments, ({ one }) => ({
  dataset: one(datasets, { fields: [riskAssessments.datasetId], references: [datasets.id] }),
  user: one(users, { fields: [riskAssessments.userId], references: [users.id] }),
}));

export const privacyOperationsRelations = relations(privacyOperations, ({ one, many }) => ({
  dataset: one(datasets, { fields: [privacyOperations.datasetId], references: [datasets.id] }),
  user: one(users, { fields: [privacyOperations.userId], references: [users.id] }),
  utilityMeasurements: many(utilityMeasurements),
}));

export const utilityMeasurementsRelations = relations(utilityMeasurements, ({ one }) => ({
  originalDataset: one(datasets, { fields: [utilityMeasurements.originalDatasetId], references: [datasets.id] }),
  processedOperation: one(privacyOperations, { fields: [utilityMeasurements.processedOperationId], references: [privacyOperations.id] }),
  user: one(users, { fields: [utilityMeasurements.userId], references: [users.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  user: one(users, { fields: [reports.userId], references: [users.id] }),
  dataset: one(datasets, { fields: [reports.datasetId], references: [datasets.id] }),
  riskAssessment: one(riskAssessments, { fields: [reports.riskAssessmentId], references: [riskAssessments.id] }),
  utilityMeasurement: one(utilityMeasurements, { fields: [reports.utilityMeasurementId], references: [utilityMeasurements.id] }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, lastLogin: true });
export const insertDatasetSchema = createInsertSchema(datasets).omit({ id: true, uploadedAt: true });
export const insertRiskAssessmentSchema = createInsertSchema(riskAssessments).omit({ id: true, createdAt: true });
export const insertPrivacyOperationSchema = createInsertSchema(privacyOperations).omit({ id: true, createdAt: true });
export const insertUtilityMeasurementSchema = createInsertSchema(utilityMeasurements).omit({ id: true, createdAt: true });
export const insertReportSchema = createInsertSchema(reports).omit({ id: true, createdAt: true });
export const insertConfigProfileSchema = createInsertSchema(configProfiles).omit({ id: true, createdAt: true });
export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertDataset = z.infer<typeof insertDatasetSchema>;
export type Dataset = typeof datasets.$inferSelect;

export type InsertRiskAssessment = z.infer<typeof insertRiskAssessmentSchema>;
export type RiskAssessment = typeof riskAssessments.$inferSelect;

export type InsertPrivacyOperation = z.infer<typeof insertPrivacyOperationSchema>;
export type PrivacyOperation = typeof privacyOperations.$inferSelect;

export type InsertUtilityMeasurement = z.infer<typeof insertUtilityMeasurementSchema>;
export type UtilityMeasurement = typeof utilityMeasurements.$inferSelect;

export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;

export type InsertConfigProfile = z.infer<typeof insertConfigProfileSchema>;
export type ConfigProfile = typeof configProfiles.$inferSelect;

export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

// Login schema
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginData = z.infer<typeof loginSchema>;

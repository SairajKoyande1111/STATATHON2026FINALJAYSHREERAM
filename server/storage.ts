import {
  users, datasets, riskAssessments, privacyOperations,
  utilityMeasurements, reports, configProfiles, activityLogs,
  type User, type InsertUser,
  type Dataset, type InsertDataset,
  type RiskAssessment, type InsertRiskAssessment,
  type PrivacyOperation, type InsertPrivacyOperation,
  type UtilityMeasurement, type InsertUtilityMeasurement,
  type Report, type InsertReport,
  type ConfigProfile, type InsertConfigProfile,
  type ActivityLog, type InsertActivityLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, inArray } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  sessionStore: session.Store;
  
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  
  // Datasets
  getDatasets(userId: number): Promise<Dataset[]>;
  getDataset(id: number): Promise<Dataset | undefined>;
  createDataset(dataset: InsertDataset): Promise<Dataset>;
  updateDataset(id: number, data: Partial<InsertDataset>): Promise<Dataset | undefined>;
  deleteDataset(id: number): Promise<void>;
  
  // Risk Assessments
  getRiskAssessments(userId: number): Promise<RiskAssessment[]>;
  getRiskAssessment(id: number): Promise<RiskAssessment | undefined>;
  createRiskAssessment(assessment: InsertRiskAssessment): Promise<RiskAssessment>;
  
  // Privacy Operations
  getPrivacyOperations(userId: number): Promise<PrivacyOperation[]>;
  getPrivacyOperation(id: number): Promise<PrivacyOperation | undefined>;
  createPrivacyOperation(operation: InsertPrivacyOperation): Promise<PrivacyOperation>;
  
  // Utility Measurements
  getUtilityMeasurements(userId: number): Promise<UtilityMeasurement[]>;
  getUtilityMeasurement(id: number): Promise<UtilityMeasurement | undefined>;
  createUtilityMeasurement(measurement: InsertUtilityMeasurement): Promise<UtilityMeasurement>;
  
  // Reports
  getReports(userId: number): Promise<Report[]>;
  getReport(id: number): Promise<Report | undefined>;
  createReport(report: InsertReport): Promise<Report>;
  deleteReport(id: number): Promise<void>;
  
  // Config Profiles
  getConfigProfiles(): Promise<ConfigProfile[]>;
  getConfigProfile(id: number): Promise<ConfigProfile | undefined>;
  createConfigProfile(profile: InsertConfigProfile): Promise<ConfigProfile>;
  deleteConfigProfile(id: number): Promise<void>;
  
  // Activity Logs
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  
  // Stats
  getStats(userId: number): Promise<{ datasets: number; assessments: number; reports: number; operations: number }>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ pool, createTableIfMissing: true });
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  // Datasets
  async getDatasets(userId: number): Promise<Dataset[]> {
    return db.select().from(datasets).where(eq(datasets.userId, userId)).orderBy(desc(datasets.uploadedAt));
  }

  async getDataset(id: number): Promise<Dataset | undefined> {
    const [dataset] = await db.select().from(datasets).where(eq(datasets.id, id));
    return dataset || undefined;
  }

  async createDataset(dataset: InsertDataset): Promise<Dataset> {
    const [result] = await db.insert(datasets).values(dataset).returning();
    return result;
  }

  async updateDataset(id: number, data: Partial<InsertDataset>): Promise<Dataset | undefined> {
    const [result] = await db.update(datasets).set(data).where(eq(datasets.id, id)).returning();
    return result || undefined;
  }

  async deleteDataset(id: number): Promise<void> {
    // Delete related records in cascade order (respecting foreign keys)
    // First delete reports that reference this dataset
    await db.delete(reports).where(eq(reports.datasetId, id));
    
    // Get privacy operations for this dataset to delete their utility measurements
    const privacyOps = await db
      .select({ id: privacyOperations.id })
      .from(privacyOperations)
      .where(eq(privacyOperations.datasetId, id));
    
    // Delete utility measurements that reference these privacy operations
    if (privacyOps.length > 0) {
      const privacyOpIds = privacyOps.map((op) => op.id);
      await db
        .delete(utilityMeasurements)
        .where(inArray(utilityMeasurements.processedOperationId, privacyOpIds));
    }
    
    // Delete privacy operations for this dataset
    await db.delete(privacyOperations).where(eq(privacyOperations.datasetId, id));
    
    // Delete risk assessments for this dataset
    await db.delete(riskAssessments).where(eq(riskAssessments.datasetId, id));
    
    // Finally delete the dataset
    await db.delete(datasets).where(eq(datasets.id, id));
  }

  // Risk Assessments
  async getRiskAssessments(userId: number): Promise<RiskAssessment[]> {
    return db.select().from(riskAssessments).where(eq(riskAssessments.userId, userId)).orderBy(desc(riskAssessments.createdAt));
  }

  async getRiskAssessment(id: number): Promise<RiskAssessment | undefined> {
    const [assessment] = await db.select().from(riskAssessments).where(eq(riskAssessments.id, id));
    return assessment || undefined;
  }

  async createRiskAssessment(assessment: InsertRiskAssessment): Promise<RiskAssessment> {
    const [result] = await db.insert(riskAssessments).values(assessment).returning();
    return result;
  }

  // Privacy Operations
  async getPrivacyOperations(userId: number): Promise<PrivacyOperation[]> {
    return db.select().from(privacyOperations).where(eq(privacyOperations.userId, userId)).orderBy(desc(privacyOperations.createdAt));
  }

  async getPrivacyOperation(id: number): Promise<PrivacyOperation | undefined> {
    const [operation] = await db.select().from(privacyOperations).where(eq(privacyOperations.id, id));
    return operation || undefined;
  }

  async createPrivacyOperation(operation: InsertPrivacyOperation): Promise<PrivacyOperation> {
    const [result] = await db.insert(privacyOperations).values(operation).returning();
    return result;
  }

  // Utility Measurements
  async getUtilityMeasurements(userId: number): Promise<UtilityMeasurement[]> {
    return db.select().from(utilityMeasurements).where(eq(utilityMeasurements.userId, userId)).orderBy(desc(utilityMeasurements.createdAt));
  }

  async getUtilityMeasurement(id: number): Promise<UtilityMeasurement | undefined> {
    const [measurement] = await db.select().from(utilityMeasurements).where(eq(utilityMeasurements.id, id));
    return measurement || undefined;
  }

  async createUtilityMeasurement(measurement: InsertUtilityMeasurement): Promise<UtilityMeasurement> {
    const [result] = await db.insert(utilityMeasurements).values(measurement).returning();
    return result;
  }

  // Reports
  async getReports(userId: number): Promise<Report[]> {
    return db.select().from(reports).where(eq(reports.userId, userId)).orderBy(desc(reports.createdAt));
  }

  async getReport(id: number): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report || undefined;
  }

  async createReport(report: InsertReport): Promise<Report> {
    const [result] = await db.insert(reports).values(report).returning();
    return result;
  }

  async deleteReport(id: number): Promise<void> {
    await db.delete(reports).where(eq(reports.id, id));
  }

  // Config Profiles
  async getConfigProfiles(): Promise<ConfigProfile[]> {
    return db.select().from(configProfiles).orderBy(desc(configProfiles.createdAt));
  }

  async getConfigProfile(id: number): Promise<ConfigProfile | undefined> {
    const [profile] = await db.select().from(configProfiles).where(eq(configProfiles.id, id));
    return profile || undefined;
  }

  async createConfigProfile(profile: InsertConfigProfile): Promise<ConfigProfile> {
    const [result] = await db.insert(configProfiles).values(profile).returning();
    return result;
  }

  async deleteConfigProfile(id: number): Promise<void> {
    await db.delete(configProfiles).where(eq(configProfiles.id, id));
  }

  // Activity Logs
  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [result] = await db.insert(activityLogs).values(log).returning();
    return result;
  }

  // Stats
  async getStats(userId: number): Promise<{ datasets: number; assessments: number; reports: number; operations: number }> {
    const [datasetsResult] = await db.select().from(datasets).where(eq(datasets.userId, userId));
    const datasetsList = await db.select().from(datasets).where(eq(datasets.userId, userId));
    const assessmentsList = await db.select().from(riskAssessments).where(eq(riskAssessments.userId, userId));
    const reportsList = await db.select().from(reports).where(eq(reports.userId, userId));
    const operationsList = await db.select().from(privacyOperations).where(eq(privacyOperations.userId, userId));
    
    return {
      datasets: datasetsList.length,
      assessments: assessmentsList.length,
      reports: reportsList.length,
      operations: operationsList.length,
    };
  }
}

export const storage = new DatabaseStorage();

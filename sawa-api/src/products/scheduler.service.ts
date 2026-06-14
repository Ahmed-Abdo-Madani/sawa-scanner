import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IngestionService } from '../ingestion/ingestion.service';
import { LocalMatcherService } from './local-matcher.service';
import { IngestionPlatform, IngestionJobMode } from '../ingestion/dto/ingestion-job.dto';
import * as fs from 'fs';
import * as path from 'path';

export interface Schedule {
  id: string;
  name: string;
  type: 'scrape_zero_districts' | 'local_match';
  intervalHours: number; // e.g. 6, 12, 24
  lastRunAt?: string;
  nextRunAt: string;
  isActive: boolean;
  params?: {
    limit?: number;
    threshold?: number;
    dryRun?: boolean;
    merchants?: string[];
  };
}

export interface ScheduleLog {
  id: string;
  scheduleId: string;
  scheduleName: string;
  type: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'completed' | 'failed';
  details?: string;
  error?: string;
}

const MAJOR_MERCHANTS_DEFAULT = [
  'othaim',
  'panda',
  'carrefour',
  'lulu hypermarket',
  'lulu express',
  'danube',
  'spinneys',
  'tamimi',
];

@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly configPath = path.join(process.cwd(), 'uploads', 'schedules.json');
  private readonly logsPath = path.join(process.cwd(), 'uploads', 'schedule-logs.json');
  
  private schedules: Schedule[] = [];
  private logs: ScheduleLog[] = [];
  private tickInterval: NodeJS.Timeout | null = null;
  private isProcessingScrape = false;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly ingestionService: IngestionService,
    private readonly localMatcherService: LocalMatcherService,
  ) {}

  onApplicationBootstrap() {
    this.ensureUploadsDir();
    this.loadSchedules();
    this.loadLogs();
    
    // Start tick loop every 60 seconds
    this.tickInterval = setInterval(() => this.tick(), 60000);
    this.logger.log('SchedulerService started tick loop (60s interval)');
    
    // Run an immediate check on startup (after 5s to let the app fully initialize)
    setTimeout(() => this.tick(), 5000);
  }

  private ensureUploadsDir() {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  }

  private loadSchedules() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        this.schedules = JSON.parse(raw);
        this.logger.log(`Loaded ${this.schedules.length} schedules from ${this.configPath}`);
      } else {
        // Initialize with default schedules if none exist
        this.schedules = [
          {
            id: 'default-scrape-zero-districts',
            name: 'Scrape Unscraped Riyadh Districts',
            type: 'scrape_zero_districts',
            intervalHours: 24,
            isActive: false, // Default disabled so user can toggle on
            nextRunAt: new Date(Date.now() + 24 * 3600000).toISOString(),
            params: { limit: 10 },
          },
          {
            id: 'default-local-match',
            name: 'Daily GTIN Matcher',
            type: 'local_match',
            intervalHours: 24,
            isActive: false, // Default disabled
            nextRunAt: new Date(Date.now() + 24 * 3600000 + 3600000).toISOString(), // offset by 1h
            params: { threshold: 0.85, limit: 1000, dryRun: false },
          }
        ];
        this.saveSchedules();
      }
    } catch (err: any) {
      this.logger.error(`Failed to load schedules: ${err.message}`);
      this.schedules = [];
    }
  }

  private saveSchedules() {
    try {
      this.ensureUploadsDir();
      fs.writeFileSync(this.configPath, JSON.stringify(this.schedules, null, 2), 'utf-8');
    } catch (err: any) {
      this.logger.error(`Failed to save schedules: ${err.message}`);
    }
  }

  private loadLogs() {
    try {
      if (fs.existsSync(this.logsPath)) {
        const raw = fs.readFileSync(this.logsPath, 'utf-8');
        this.logs = JSON.parse(raw);
      } else {
        this.logs = [];
        this.saveLogs();
      }
    } catch (err: any) {
      this.logger.error(`Failed to load schedule logs: ${err.message}`);
      this.logs = [];
    }
  }

  private saveLogs() {
    try {
      this.ensureUploadsDir();
      // Keep only last 200 logs to prevent file bloat
      if (this.logs.length > 200) {
        this.logs = this.logs.slice(0, 200);
      }
      fs.writeFileSync(this.logsPath, JSON.stringify(this.logs, null, 2), 'utf-8');
    } catch (err: any) {
      this.logger.error(`Failed to save logs: ${err.message}`);
    }
  }

  private addLog(log: ScheduleLog) {
    this.logs.unshift(log);
    this.saveLogs();
  }

  private updateLog(id: string, updates: Partial<ScheduleLog>) {
    const logIdx = this.logs.findIndex((l) => l.id === id);
    if (logIdx !== -1) {
      this.logs[logIdx] = { ...this.logs[logIdx], ...updates } as ScheduleLog;
      this.saveLogs();
    }
  }

  getSchedules(): Schedule[] {
    return this.schedules;
  }

  getLogs(): ScheduleLog[] {
    return this.logs;
  }

  upsertSchedule(schedule: Schedule): Schedule {
    const existingIdx = this.schedules.findIndex((s) => s.id === schedule.id);
    
    // Ensure nextRunAt is calculated if not present
    if (!schedule.nextRunAt) {
      schedule.nextRunAt = new Date(Date.now() + schedule.intervalHours * 3600000).toISOString();
    }

    if (existingIdx !== -1) {
      this.schedules[existingIdx] = { ...this.schedules[existingIdx], ...schedule };
    } else {
      this.schedules.push(schedule);
    }

    this.saveSchedules();
    this.logger.log(`Schedule upserted: ${schedule.name} (${schedule.id})`);
    return schedule;
  }

  deleteSchedule(id: string): boolean {
    const idx = this.schedules.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.schedules.splice(idx, 1);
      this.saveSchedules();
      this.logger.log(`Schedule deleted: ${id}`);
      return true;
    }
    return false;
  }

  async triggerScheduleManually(id: string): Promise<boolean> {
    const schedule = this.schedules.find((s) => s.id === id);
    if (!schedule) {
      throw new Error(`Schedule ${id} not found`);
    }

    this.logger.log(`Manual trigger requested for schedule: ${schedule.name}`);
    // Run asynchronously
    this.runTask(schedule).catch((err) => {
      this.logger.error(`Error executing manual task: ${err.message}`);
    });
    
    return true;
  }

  private async tick() {
    const now = new Date();
    for (const schedule of this.schedules) {
      if (!schedule.isActive) continue;

      const nextRun = new Date(schedule.nextRunAt);
      if (now >= nextRun) {
        this.logger.log(`Schedule due for execution: ${schedule.name} (Scheduled: ${schedule.nextRunAt})`);
        
        // Update next run time first to avoid double-triggers
        schedule.lastRunAt = now.toISOString();
        schedule.nextRunAt = new Date(now.getTime() + schedule.intervalHours * 3600000).toISOString();
        this.saveSchedules();

        // Run the task
        this.runTask(schedule).catch((err) => {
          this.logger.error(`Error running scheduled task ${schedule.name}: ${err.message}`);
        });
      }
    }
  }

  private async runTask(schedule: Schedule) {
    const logId = `run-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const logEntry: ScheduleLog = {
      id: logId,
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      type: schedule.type,
      startedAt: new Date().toISOString(),
      status: 'running',
    };
    
    this.addLog(logEntry);

    try {
      if (schedule.type === 'scrape_zero_districts') {
        const resultDetails = await this.executeScrapeZeroDistricts(schedule.params?.limit);
        this.updateLog(logId, {
          status: 'completed',
          finishedAt: new Date().toISOString(),
          details: resultDetails,
        });
      } else if (schedule.type === 'local_match') {
        const threshold = schedule.params?.threshold ?? 0.85;
        const limit = schedule.params?.limit ?? 1000;
        const dryRun = schedule.params?.dryRun ?? false;

        const matcherStatus = await this.localMatcherService.triggerMatching({
          threshold,
          limit,
          dryRun,
        });

        this.updateLog(logId, {
          status: 'completed',
          finishedAt: new Date().toISOString(),
          details: `Local Matcher triggered. Limit=${limit}, Threshold=${threshold}, DryRun=${dryRun}. Matcher state: ${matcherStatus.status}`,
        });
      }
    } catch (err: any) {
      this.logger.error(`Task ${schedule.name} failed: ${err.message}`);
      this.updateLog(logId, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        error: err.message,
      });
    }
  }

  private async executeScrapeZeroDistricts(limitParam?: number): Promise<string> {
    if (this.isProcessingScrape) {
      throw new Error('A scheduled district scraping batch is already running');
    }
    
    this.isProcessingScrape = true;
    const limit = limitParam ?? 10;
    
    try {
      // Step 1: Find districts that currently have ZERO scraped stores
      const zeroDistrictsRes = await this.dataSource.query(`
        SELECT DISTINCT s.district_name_en as district
        FROM store s
        WHERE s.platform = 'hungerstation'
          AND (s.city_slug = 'riyadh' OR s.city_name_en ILIKE '%riyadh%')
          AND s.district_name_en IS NOT NULL
        GROUP BY s.district_name_en
        HAVING SUM(CASE WHEN EXISTS (
          SELECT 1 FROM product_price pp WHERE pp.store_id = s.id
        ) THEN 1 ELSE 0 END) = 0
        ORDER BY s.district_name_en
      `);

      const zeroDistricts = zeroDistrictsRes.map((r: any) => r.district).filter(Boolean);
      
      if (zeroDistricts.length === 0) {
        this.isProcessingScrape = false;
        return 'All districts already have scraped data. 0 stores enqueued.';
      }

      // Step 2: Find major supermarket stores inside those zero districts
      const storesRes = await this.dataSource.query(`
        SELECT
          s.id,
          s.source_url,
          m.name_en as merchant_name,
          s.district_name_en as district,
          COUNT(pp.id) as price_count
        FROM store s
        INNER JOIN merchant m ON s.merchant_id = m.id
        LEFT JOIN product_price pp ON pp.store_id = s.id
        WHERE s.platform = 'hungerstation'
          AND (s.city_slug = 'riyadh' OR s.city_name_en ILIKE '%riyadh%')
          AND LOWER(m.name_en) = ANY($1)
          AND s.district_name_en = ANY($2)
        GROUP BY s.id, s.source_url, m.name_en, s.district_name_en
        HAVING COUNT(pp.id) = 0
        ORDER BY m.name_en ASC, s.district_name_en ASC
        LIMIT $3
      `, [MAJOR_MERCHANTS_DEFAULT, zeroDistricts, limit]);

      if (storesRes.length === 0) {
        this.isProcessingScrape = false;
        return 'No major supermarkets found in zero-scraped districts. 0 stores enqueued.';
      }

      // Trigger scraping sequentially in the background with a delay between them
      this.logger.log(`Scheduled Scraper: Triggering ${storesRes.length} stores in zero districts...`);
      
      // We run the sequential trigger asynchronously so we don't block the scheduler thread
      this.runSequentialScrapeTrigger(storesRes);

      const targetList = storesRes.map((s: any) => `${s.merchant_name} (${s.district})`).join(', ');
      this.isProcessingScrape = false;
      return `Successfully enqueued ${storesRes.length} stores: ${targetList}`;
    } catch (err: any) {
      this.isProcessingScrape = false;
      throw err;
    }
  }

  private async runSequentialScrapeTrigger(stores: any[]) {
    const delay = 15000; // 15 seconds delay between store enqueues to prevent queue bloat
    for (let i = 0; i < stores.length; i++) {
      const store = stores[i];
      try {
        this.logger.log(`Scheduler enqueuing store ${i + 1}/${stores.length}: ${store.merchant_name} in ${store.district}`);
        await this.ingestionService.addIngestionJob({
          platform: IngestionPlatform.HUNGERSTATION,
          mode: IngestionJobMode.HS_CATALOG_SCRAPE,
          storeUrl: store.source_url,
          dryRun: false,
        } as any);
      } catch (err: any) {
        this.logger.error(`Scheduler failed to enqueue store ${store.id}: ${err.message}`);
      }
      if (i < stores.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    this.logger.log('Scheduler finished enqueuing all stores for the scheduled zero-district batch.');
  }
}

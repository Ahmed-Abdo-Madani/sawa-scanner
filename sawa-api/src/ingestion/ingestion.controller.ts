import { Controller, Post, Body, Get, Param, NotFoundException, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestionJobDto } from './dto/ingestion-job.dto';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard'; 
import { AdminGuard } from '../auth/admin.guard';

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('jobs')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @UseGuards(FirebaseAuthGuard, AdminGuard)
  async createJob(@Body() dto: IngestionJobDto) {
    return this.ingestionService.addIngestionJob(dto);
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const status = await this.ingestionService.getJobStatus(id);
    if (!status) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
    return status;
  }
}

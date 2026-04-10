import { Controller, Post, Body, Get, Param, NotFoundException, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestionJobDto } from './dto/ingestion-job.dto';
// Assuming Firebase guard exists (checked PROJECT_STATUS.md)
// import { FirebaseAuthGuard } from '../auth/firebase-auth.guard'; 

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('jobs')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  //@UseGuards(FirebaseAuthGuard) // Uncomment once auth is fully wired
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

import { Controller, Post, Body, UsePipes, ValidationPipe } from '@nestjs/common';
import { ScanService } from './scan.service';
import { ScanLabelDto } from './dto/scan-label.dto';
import { Public } from '../auth/public.decorator';

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Public()
  @Post('label')
  @UsePipes(new ValidationPipe({ transform: true }))
  async scanLabel(@Body() dto: ScanLabelDto) {
    return this.scanService.processLabelScan(dto);
  }
}

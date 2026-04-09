import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

class ScanFrameOverlay extends StatelessWidget {
  final double scanLineOffset;

  const ScanFrameOverlay({super.key, required this.scanLineOffset});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        CustomPaint(
          size: Size.infinite,
          painter: _CornerBracketPainter(),
        ),
        Positioned(
          top: MediaQuery.of(context).size.height * 0.25 + (MediaQuery.of(context).size.width * 0.6 * scanLineOffset),
          left: MediaQuery.of(context).size.width * 0.2,
          right: MediaQuery.of(context).size.width * 0.2,
          child: Container(
            height: 2,
            decoration: BoxDecoration(
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withOpacity(0.5),
                  blurRadius: 10,
                  spreadRadius: 2,
                ),
              ],
              gradient: LinearGradient(
                colors: [
                  AppColors.primary.withOpacity(0),
                  AppColors.primary,
                  AppColors.primary.withOpacity(0),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _CornerBracketPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.primary
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final width = size.width;
    final height = size.height;
    final holeWidth = width * 0.6;
    final holeHeight = width * 0.6; 
    
    final left = (width - holeWidth) / 2;
    final top = height * 0.25;
    final right = left + holeWidth;
    final bottom = top + holeHeight;
    final bracketLength = 30.0;

    // Top Left
    canvas.drawLine(Offset(left, top), Offset(left + bracketLength, top), paint);
    canvas.drawLine(Offset(left, top), Offset(left, top + bracketLength), paint);

    // Top Right
    canvas.drawLine(Offset(right, top), Offset(right - bracketLength, top), paint);
    canvas.drawLine(Offset(right, top), Offset(right, top + bracketLength), paint);

    // Bottom Left
    canvas.drawLine(Offset(left, bottom), Offset(left + bracketLength, bottom), paint);
    canvas.drawLine(Offset(left, bottom), Offset(left, bottom - bracketLength), paint);

    // Bottom Right
    canvas.drawLine(Offset(right, bottom), Offset(right - bracketLength, bottom), paint);
    canvas.drawLine(Offset(right, bottom), Offset(right, bottom - bracketLength), paint);
    
    // Dim the outside area
    final backgroundPaint = Paint()..color = Colors.black.withOpacity(0.5);
    final path = Path()
      ..addRect(Rect.fromLTWH(0, 0, width, height))
      ..addRect(Rect.fromLTRB(left, top, right, bottom))
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(path, backgroundPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

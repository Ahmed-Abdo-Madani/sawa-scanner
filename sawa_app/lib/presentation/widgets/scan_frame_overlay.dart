import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../core/theme/app_colors.dart';

class ScanFrameOverlay extends StatelessWidget {
  final double topPadding;
  const ScanFrameOverlay({super.key, this.topPadding = 0.0});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return Stack(
          children: [
            CustomPaint(
              size: Size.infinite,
              painter: _CornerBracketPainter(topPadding: topPadding),
            ),
            Center(
              child: SvgPicture.asset(
                'assets/images/barcode-icon.svg',
                colorFilter: const ColorFilter.mode(Colors.white70, BlendMode.srcIn),
                width: 48,
                height: 48,
              ),
            ),
          ],
        );
      },
    );
  }
}

class _CornerBracketPainter extends CustomPainter {
  final double topPadding;
  _CornerBracketPainter({required this.topPadding});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white
      ..strokeWidth = 4.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final width = size.width;
    final height = size.height;
    final holeWidth = width * 0.9;
    final holeHeight = height * 0.7;
    
    final left = (width - holeWidth) / 2;
    final top = (height - holeHeight) / 2 + topPadding / 2;
    final right = left + holeWidth;
    final bottom = top + holeHeight;
    final arcSize = 50.0;

    // Curved Corners
    // Top Left
    canvas.drawArc(
      Rect.fromLTWH(left, top, arcSize, arcSize),
      3.14159, // PI
      1.57079, // PI / 2
      false,
      paint,
    );

    // Top Right
    canvas.drawArc(
      Rect.fromLTWH(right - arcSize, top, arcSize, arcSize),
      4.71238, // 3 * PI / 2
      1.57079,
      false,
      paint,
    );

    // Bottom Left
    canvas.drawArc(
      Rect.fromLTWH(left, bottom - arcSize, arcSize, arcSize),
      1.57079, // PI / 2
      1.57079,
      false,
      paint,
    );

    // Bottom Right
    canvas.drawArc(
      Rect.fromLTWH(right - arcSize, bottom - arcSize, arcSize, arcSize),
      0,
      1.57079,
      false,
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

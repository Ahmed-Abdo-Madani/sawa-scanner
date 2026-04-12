import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider to manage the current index of the bottom navigation bar.
/// 0: Scanner
/// 1: History
/// 2: Profile
final navigationProvider = StateProvider<int>((ref) => 0);

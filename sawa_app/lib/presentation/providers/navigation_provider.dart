import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider to manage the current index of the bottom navigation bar.
/// 0: Profile
/// 1: Scanner
/// 2: Cart
final navigationProvider = StateProvider<int>((ref) => 1);

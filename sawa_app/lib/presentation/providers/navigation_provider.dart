import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider to manage the current index of the bottom navigation bar.
/// 0: Cart
/// 1: Scanner
/// 2: Profile
final navigationProvider = StateProvider<int>((ref) => 1);

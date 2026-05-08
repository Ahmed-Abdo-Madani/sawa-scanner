import 'package:firebase_auth/firebase_auth.dart';

class AuthDataSource {
  final FirebaseAuth _firebaseAuth;

  AuthDataSource({FirebaseAuth? firebaseAuth})
      : _firebaseAuth = firebaseAuth ?? FirebaseAuth.instance;

  Future<UserCredential> signInWithEmailAndPassword(String email, String password) async {
    return await _firebaseAuth.signInWithEmailAndPassword(email: email, password: password);
  }

  Future<void> signOut() async {
    await _firebaseAuth.signOut();
  }

  Future<String?> getIdToken({bool forceRefresh = false}) async {
    return await _firebaseAuth.currentUser?.getIdToken(forceRefresh);
  }

  Stream<User?> userChanges() {
    return _firebaseAuth.userChanges();
  }

  Future<bool> isAdmin({bool forceRefresh = false}) async {
    final user = _firebaseAuth.currentUser;
    if (user == null) return false;
    final result = await user.getIdTokenResult(forceRefresh);
    return result.claims?['admin'] == true;
  }
}

import UIKit
import Capacitor
import UserNotifications
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Initialize Firebase
        FirebaseApp.configure()
        
        // Set up Firebase Messaging delegate
        Messaging.messaging().delegate = self
        
        // Register for push notifications
        UNUserNotificationCenter.current().delegate = self
        
        // Request notification permissions
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            print("Push notification permission granted: \(granted)")
            if let error = error {
                print("Push notification permission error: \(error)")
            }
        }
        
        // Register for remote notifications
        application.registerForRemoteNotifications()
        
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Push Notification Registration
    
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Forward token to Firebase
        Messaging.messaging().apnsToken = deviceToken
        
        // Also forward to Capacitor
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
        
        // Log the token for debugging
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("📱 APNs Device Token: \(tokenString)")
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("❌ Failed to register for remote notifications: \(error)")
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension AppDelegate: UNUserNotificationCenterDelegate {
    
    // Handle notifications when app is in foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let userInfo = notification.request.content.userInfo
        print("📬 Received notification in foreground: \(userInfo)")
        
        // Show notification even when app is in foreground
        completionHandler([.banner, .badge, .sound])
    }
    
    // Handle notification tap
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        print("👆 User tapped notification: \(userInfo)")
        
        // Forward to app
        NotificationCenter.default.post(name: Notification.Name("pushNotificationReceived"), object: nil, userInfo: userInfo)
        completionHandler()
    }
}

// MARK: - Firebase Messaging Delegate

extension AppDelegate: MessagingDelegate {
    
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        print("🔥 Firebase FCM Token: \(fcmToken ?? "nil")")
        
        // Store the FCM token - use Capacitor Preferences key format for JS access
        if let token = fcmToken {
            // Capacitor Preferences uses "CapacitorStorage." prefix
            UserDefaults.standard.set(token, forKey: "CapacitorStorage.fcmToken")
            
            // Post notification so the app can send this to your backend
            NotificationCenter.default.post(
                name: Notification.Name("FCMTokenReceived"),
                object: nil,
                userInfo: ["token": token]
            )
        }
    }
}

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import PushNotificationService, { NotificationPreferences } from '../services/pushNotificationService';

interface NotificationPermissionProps {
  onPermissionGranted?: () => void;
  onPermissionDenied?: () => void;
}

export const NotificationPermission: React.FC<NotificationPermissionProps> = ({
  onPermissionGranted,
  onPermissionDenied
}) => {
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);

  const pushService = PushNotificationService.getInstance();

  useEffect(() => {
    checkPermissionStatus();
    loadPreferences();
  }, []);

  const checkPermissionStatus = () => {
    const status = pushService.getPermissionStatus();
    setPermissionStatus(status);
  };

  const loadPreferences = () => {
    const prefs = pushService.getPreferences();
    setPreferences(prefs);
  };

  const requestPermission = async () => {
    setIsLoading(true);
    try {
      const permission = await pushService.requestPermission();
      setPermissionStatus(permission);
      
      if (permission === 'granted') {
        // Initialize push notifications
        await pushService.initialize();
        onPermissionGranted?.();
      } else {
        onPermissionDenied?.();
      }
    } catch (error) {
      console.error('Failed to request notification permission:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreferences = (newPreferences: Partial<NotificationPreferences>) => {
    const updatedPrefs = { ...preferences, ...newPreferences } as NotificationPreferences;
    setPreferences(updatedPrefs);
    pushService.savePreferences(updatedPrefs);
  };

  const getPermissionStatusColor = () => {
    switch (permissionStatus) {
      case 'granted':
        return 'text-green-600';
      case 'denied':
        return 'text-red-600';
      case 'default':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  const getPermissionStatusIcon = () => {
    switch (permissionStatus) {
      case 'granted':
        return '✅';
      case 'denied':
        return '❌';
      case 'default':
        return '⏳';
      default:
        return '❓';
    }
  };

  const getPermissionStatusText = () => {
    switch (permissionStatus) {
      case 'granted':
        return 'Notifications Enabled';
      case 'denied':
        return 'Notifications Blocked';
      case 'default':
        return 'Permission Required';
      default:
        return 'Unknown Status';
    }
  };

  if (!preferences) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Permission Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Notification Permission</span>
            <Badge variant={permissionStatus === 'granted' ? 'default' : 'destructive'}>
              {getPermissionStatusIcon()} {getPermissionStatusText()}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`text-center py-4 px-4 rounded-lg ${getPermissionStatusColor()} bg-opacity-10`}>
            <p className="text-sm font-medium">
              {permissionStatus === 'granted' && 'Push notifications are enabled for Wata-Board.'}
              {permissionStatus === 'denied' && 'Push notifications are blocked. Please enable them in your browser settings.'}
              {permissionStatus === 'default' && 'Permission is required to send payment status notifications.'}
            </p>
          </div>

          {permissionStatus !== 'granted' && (
            <div className="text-center">
              <Button 
                onClick={requestPermission} 
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Requesting...' : 'Enable Notifications'}
              </Button>
            </div>
          )}

          {permissionStatus === 'denied' && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-medium text-yellow-800 mb-2">How to enable notifications:</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-yellow-700">
                <li>Click the lock icon 🔒 in your browser's address bar</li>
                <li>Select "Allow" or "Notifications" from the dropdown</li>
                <li>Refresh the page and try again</li>
              </ol>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      {permissionStatus === 'granted' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Notification Preferences</span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
              >
                {showSettings ? 'Hide' : 'Show'} Settings
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick Toggle Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.paymentConfirmed}
                    onChange={(e) => updatePreferences({ paymentConfirmed: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">Payment Confirmed</span>
                </label>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.paymentFailed}
                    onChange={(e) => updatePreferences({ paymentFailed: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">Payment Failed</span>
                </label>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.paymentProcessing}
                    onChange={(e) => updatePreferences({ paymentProcessing: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">Payment Processing</span>
                </label>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.paymentConfirmationRequired}
                    onChange={(e) => updatePreferences({ paymentConfirmationRequired: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">Action Required</span>
                </label>
              </div>
            </div>

            {/* Advanced Settings */}
            {showSettings && (
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-medium mb-3">Advanced Settings</h4>
                
                {/* Sound and Vibration */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.soundEnabled}
                        onChange={(e) => updatePreferences({ soundEnabled: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">Sound Effects</span>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.vibrationEnabled}
                        onChange={(e) => updatePreferences({ vibrationEnabled: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm">Vibration</span>
                    </label>
                  </div>
                </div>

                {/* Quiet Hours */}
                <div className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.quietHours.enabled}
                        onChange={(e) => updatePreferences({ 
                          quietHours: { ...preferences.quietHours, enabled: e.target.checked }
                        })}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium">Quiet Hours</span>
                    </label>
                  </div>
                  
                  {preferences.quietHours.enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Start Time</label>
                        <input
                          type="time"
                          value={preferences.quietHours.start}
                          onChange={(e) => updatePreferences({ 
                            quietHours: { ...preferences.quietHours, start: e.target.value }
                          })}
                          className="w-full p-2 border rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">End Time</label>
                        <input
                          type="time"
                          value={preferences.quietHours.end}
                          onChange={(e) => updatePreferences({ 
                            quietHours: { ...preferences.quietHours, end: e.target.value }
                          })}
                          className="w-full p-2 border rounded"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Test Notification */}
                <div className="pt-4 border-t">
                  <Button 
                    variant="outline" 
                    onClick={async () => {
                      await pushService.showLocalNotification({
                        type: 'payment-confirmed',
                        title: 'Test Notification',
                        body: 'This is a test notification from Wata-Board.',
                        data: { test: true }
                      });
                    }}
                    >
                    Send Test Notification
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscription Status */}
      {permissionStatus === 'granted' && (
        <Card>
          <CardHeader>
            <CardTitle>Subscription Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600">
              <p>Push notifications are active and you'll receive updates for:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                {preferences.paymentConfirmed && <li>Payment confirmations</li>}
                {preferences.paymentFailed && <li>Payment failures</li>}
                {preferences.paymentProcessing && <li>Payment processing updates</li>}
                {preferences.paymentConfirmationRequired && <li>Action required notifications</li>}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default NotificationPermission;

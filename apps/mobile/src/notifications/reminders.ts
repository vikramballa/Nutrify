import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  COACH_HOUR,
  COACH_WEEKDAY,
  learnReminders,
  reminderCopy,
  type LogSample,
} from './schedule';

/**
 * All reminders are *local* notifications: scheduled on the device, delivered
 * by the OS. No push service, no server, no credentials, nothing to pay for —
 * and they keep working with the API offline.
 */

const ENABLED_KEY = 'remindersEnabled';
/** Tags our own scheduled notifications so we never cancel someone else's. */
const CHANNEL = 'nutrichef-reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false, // a silent nudge; sound makes people disable it
    shouldSetBadge: false,
  }),
});

export async function remindersEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
}

async function setEnabledFlag(on: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, String(on));
}

/** Android needs an explicit channel or scheduled notifications stay silent. */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Meal reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 120],
    lightColor: '#FF7A45',
  });
}

/** Ask once. Returns false if the user said no — never re-prompt on our own. */
export async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Rebuild the whole schedule from the user's logging history. Cancelling first
 * keeps this idempotent — calling it on every launch must not stack duplicates.
 */
export async function rescheduleFrom(samples: LogSample[]): Promise<void> {
  if (!(await remindersEnabled())) return;
  await ensureChannel();
  await cancelAll();

  for (const { mealType, hour, minute } of learnReminders(samples)) {
    const { title, body } = reminderCopy(mealType);
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { mealType } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: CHANNEL,
      },
    });
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Your week is ready',
      body: 'See how the week went and what to try next.',
      data: { screen: 'Progress' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: COACH_WEEKDAY,
      hour: COACH_HOUR,
      minute: 0,
      channelId: CHANNEL,
    },
  });
}

/** Turn reminders on (asking permission if needed) or off. Returns the result. */
export async function setRemindersEnabled(on: boolean, samples: LogSample[]): Promise<boolean> {
  if (!on) {
    await setEnabledFlag(false);
    await cancelAll();
    return false;
  }
  if (!(await requestPermission())) {
    await setEnabledFlag(false);
    return false;
  }
  await setEnabledFlag(true);
  await rescheduleFrom(samples);
  return true;
}

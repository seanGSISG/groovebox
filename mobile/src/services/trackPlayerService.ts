import TrackPlayer, { Event } from 'react-native-track-player';

export async function setupTrackPlayerService() {
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    try {
      await TrackPlayer.play();
    } catch (error) {
      console.error('Error handling RemotePlay event:', error);
    }
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    try {
      await TrackPlayer.pause();
    } catch (error) {
      console.error('Error handling RemotePause event:', error);
    }
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    try {
      await TrackPlayer.stop();
    } catch (error) {
      console.error('Error handling RemoteStop event:', error);
    }
  });
}

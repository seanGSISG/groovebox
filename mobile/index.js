/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import TrackPlayer from 'react-native-track-player';
import { setupTrackPlayerService } from './src/services/trackPlayerService';

// Register playback service
TrackPlayer.registerPlaybackService(() => setupTrackPlayerService);

AppRegistry.registerComponent(appName, () => App);

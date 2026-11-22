import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/600.css';
import '@fontsource/lexend/700.css';
import 'material-symbols/rounded.css';
import './styles/tokens.css';
import App from './App.vue';

createApp(App).use(createPinia()).mount('#app');

globalThis.TRAVELNOTE_LOCAL = true
// Load the planner after selecting local mode. The same forms and translations
// are used, but the local branch never calls the server API.
import('../../src/main.js').then(() => import('./style.css'))

# ScoutScape

ScoutScape streamlines Vancouver film location scouting by combining Overpass facility data, TomTom traffic flow, Open-Meteo weather conditions, and Gemini-powered equipment guidance in a single map workflow.

## Environment variables

Create a `.env` file in the project root (or otherwise provide environment variables at build time) with the following keys:

```
REACT_APP_TOMTOM_API_KEY=<your TomTom Traffic API key>
REACT_APP_GEMINI_API_KEY=<your Google Gemini API key>
```

The TomTom key powers the time-targeted traffic insights card, and the Gemini key enables the Analyze Sound workflow to produce summaries and equipment recommendations. Without these keys the UI will render informative messages explaining which features are unavailable.

## Available scripts

In the project directory you can run:

- `npm start` – start the development server at [http://localhost:3000](http://localhost:3000)
- `CI=true npm test -- --watch=false` – execute the test suite once in CI mode
- `npm run build` – generate a production build in the `build` directory

All other Create React App scripts remain available if you need them.

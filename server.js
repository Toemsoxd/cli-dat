const express = require('express');
const axios = require('axios');
const app = express();

// Middleware para logs rápidos en Render
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// MAPEO DE CÓDIGOS DE CLIMA (WMO de Open-Meteo a Códigos de Iconos de AccuWeather)
function getAccuWeatherIconAndText(wmoCode, isDay = true) {
    switch (wmoCode) {
        case 0: // Cielo despejado
            return { icon: isDay ? "1" : "33", text: isDay ? "Soleado" : "Despejado" };
        case 1:
        case 2: // Parcialmente nublado
            return { icon: isDay ? "2" : "34", text: "Parcialmente nublado" };
        case 3: // Nublado
            return { icon: isDay ? "6" : "38", text: "Nublado" };
        case 45:
        case 48: // Niebla
            return { icon: "11", text: "Niebla" };
        case 51:
        case 53:
        case 55: // Llovizna
            return { icon: "12", text: "Llovizna" };
        case 56:
        case 57: // Llovizna helada
            return { icon: "26", text: "Llovizna helada" };
        case 61:
        case 63: // Lluvia ligera/moderada
            return { icon: "18", text: "Lluvia" };
        case 65: // Lluvia fuerte
            return { icon: "18", text: "Lluvia fuerte" };
        case 66:
        case 67: // Lluvia helada
            return { icon: "26", text: "Lluvia helada" };
        case 71:
        case 73:
        case 75: // Nieve
            return { icon: "22", text: "Nevada" };
        case 77: // Granizo de nieve
            return { icon: "22", text: "Granizo fino" };
        case 80:
        case 81:
        case 82: // Chubascos de lluvia
            return { icon: "12", text: "Chubascos" };
        case 85:
        case 86: // Chubascos de nieve
            return { icon: "22", text: "Chubascos de nieve" };
        case 95: // Tormenta eléctrica
            return { icon: "15", text: "Tormenta eléctrica" };
        case 96:
        case 99: // Tormenta con granizo
            return { icon: "15", text: "Tormenta con granizo" };
        default:
            return { icon: isDay ? "1" : "33", text: "Despejado" };
    }
}

// 1. ENDPOINT DE GEOPOSICIÓN (Búsqueda por coordenadas del GPS del teléfono)
app.get('/locations/v1/cities/geoposition/search.json', async (req, res) => {
    try {
        const query = req.query.q; // Formato: "latitude,longitude"
        if (!query) {
            return res.status(400).json({ error: "Falta parámetro 'q'" });
        }

        const [lat, lon] = query.split(',');
        console.log(`Petición GPS recibida para Lat: ${lat}, Lon: ${lon}`);

        let cityName = "Ubicación Actual";
        let stateName = "Tu Región";
        let countryName = "Tu País";

        try {
            const geoRes = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`, {
                headers: { 'User-Agent': 'SamsungTouchWizWeatherReviver/1.0' }
            });
            if (geoRes.data && geoRes.data.address) {
                cityName = geoRes.data.address.city || geoRes.data.address.town || geoRes.data.address.village || cityName;
                stateName = geoRes.data.address.state || geoRes.data.address.county || stateName;
                countryName = geoRes.data.address.country || countryName;
            }
        } catch (err) {
            console.log("No se pudo obtener el nombre de la ciudad vía geocoding, usando fallbacks genéricos.");
        }

        const encodedKey = `${lat}_${lon}`;

        const responseLocation = {
            "Key": encodedKey,
            "LocalizedName": cityName,
            "EnglishName": cityName,
            "Country": {
                "ID": "XX",
                "LocalizedName": countryName,
                "EnglishName": countryName
            },
            "AdministrativeArea": {
                "ID": "XX",
                "LocalizedName": stateName,
                "EnglishName": stateName
            }
        };

        res.json(responseLocation);

    } catch (error) {
        console.error("Error en geoposition search:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// 2. ENDPOINT DE CLIMA DETALLADO Y PRONÓSTICO (Alimenta el widget)
app.get('/localweather/v1/:location', async (req, res) => {
    try {
        const locationKey = req.params.location; // "lat_lon"
        
        let lat = 40.41;
        let lon = -3.70;
        let cityNameQuery = "Madrid";

        if (locationKey && locationKey.includes('_')) {
            const parts = locationKey.split('_');
            lat = parseFloat(parts[0]);
            lon = parseFloat(parts[1]);
        }

        let displayCity = "Tu Ciudad";
        try {
            const geoRes = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`, {
                headers: { 'User-Agent': 'SamsungTouchWizWeatherReviver/1.0' }
            });
            if (geoRes.data && geoRes.data.address) {
                displayCity = geoRes.data.address.city || geoRes.data.address.town || geoRes.data.address.village || displayCity;
                cityNameQuery = displayCity;
            }
        } catch (e) {}

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,is_day,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto`;
        const weatherResponse = await axios.get(weatherUrl);
        const data = weatherResponse.data;

        const currentWmo = data.current.weather_code;
        const isDay = data.current.is_day === 1;
        const currentMapping = getAccuWeatherIconAndText(currentWmo, isDay);

        const realAccuWeatherLink = `https://www.accuweather.com/es/search-locations?query=${encodeURIComponent(cityNameQuery)}`;

        const dailyForecasts = [];
        for (let i = 0; i < 7; i++) {
            const dayWmo = data.daily.weather_code[i] !== undefined ? data.daily.weather_code[i] : 0;
            const dayMapping = getAccuWeatherIconAndText(dayWmo, true);
            const nightMapping = getAccuWeatherIconAndText(dayWmo, false);

            const minTemp = data.daily.temperature_2m_min[i] !== undefined ? Math.round(data.daily.temperature_2m_min[i]) : 15;
            const maxTemp = data.daily.temperature_2m_max[i] !== undefined ? Math.round(data.daily.temperature_2m_max[i]) : 25;

            const rawSunrise = data.daily.sunrise[i] ? new Date(data.daily.sunrise[i]) : new Date();
            const rawSunset = data.daily.sunset[i] ? new Date(data.daily.sunset[i]) : new Date();

            const formatTime = (dateObj) => {
                let hours = dateObj.getHours();
                const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12;
                hours = hours ? hours : 12;
                return `2026-06-21T${String(hours).padStart(2, '0')}:${minutes}:00-00:00`;
            };

            dailyForecasts.push({
                "MobileLink": realAccuWeatherLink,
                "Temperature": {
                    "Minimum": { "Value": String(minTemp) },
                    "Maximum": { "Value": String(maxTemp) }
                },
                "Sun": {
                    "Rise": formatTime(rawSunrise),
                    "Set": formatTime(rawSunset)
                },
                "Day": {
                    "Icon": parseInt(dayMapping.icon),
                    "Rain": { "Value": 0.0 },
                    "Snow": { "Value": 0.0 },
                    "Ice": { "Value": 0.0 },
                    "TotalLiquid": { "Value": 0.0 },
                    "RainProbability": 10,
                    "SnowProbability": 0,
                    "IceProbability": 0,
                    "PrecipitationProbability": 10
                },
                "Night": {
                    "Icon": parseInt(nightMapping.icon),
                    "Rain": { "Value": 0.0 },
                    "Snow": { "Value": 0.0 },
                    "Ice": { "Value": 0.0 },
                    "TotalLiquid": { "Value": 0.0 },
                    "RainProbability": 5,
                    "SnowProbability": 0,
                    "IceProbability": 0,
                    "PrecipitationProbability": 5
                }
            });
        }

        const samsungJSONResponse = {
            "Location": {
                "Key": locationKey,
                "TimeZone": {
                    "GmtOffset": "0.0",
                    "IsDaylightSaving": "False"
                }
            },
            "CurrentConditions": {
                "WeatherText": currentMapping.text,
                "WeatherIcon": currentMapping.icon,
                "Temperature": {
                    "Value": String(Math.round(data.current.temperature_2m))
                },
                "RealFeelTemperature": {
                    "Value": String(Math.round(data.current.temperature_2m))
                },
                "MobileLink": realAccuWeatherLink,
                "RelativeHumidity": String(data.current.relative_humidity_2m),
                "UVIndex": data.daily.uv_index_max[0] ? Math.round(data.daily.uv_index_max[0]) : 3,
                "UVIndexText": "Moderado",
                "Photos": []
            },
            "ForecastSummary": {
                "DailyForecasts": dailyForecasts
            }
        };

        res.json(samsungJSONResponse);

    } catch (error) {
        console.error("Error al procesar el clima:", error);
        res.status(500).json({ error: "Error interno procesando datos del clima" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Clima TouchWiz escuchando en puerto ${PORT}`);
});
```
eof

```json:Configuración de Render:package.json
{
  "name": "touchwiz-weather-server",
  "version": "1.0.0",
  "description": "Servidor para revivir widgets de clima TouchWiz antiguos",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "express": "^4.19.2"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "private": true
}
```
eof

### Configuración final en el panel de Render:
Al configurar tu "Web Service" en la plataforma de Render, asegúrate de que estos dos ajustes coincidan exactamente:

1. **Build Command:** `npm install` (y nada más, deja vacío cualquier script de build complejo).
2. **Start Command:** `npm start` (o `node server.js`).

Guarda los archivos, realiza el commit y push correspondientes. Render debería compilar e iniciar el servidor limpiamente y sin errores de salida ahora. ¿Me cuentas si este despliegue por fin se completa con éxito?
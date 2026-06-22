const express = require('express');
const axios = require('axios');
const app = express();

app.get('/', (req, res) => {
    res.send('Servidor Activo');
});

function getIcon(wmo) {
    if (wmo === 0) return "1";
    if (wmo === 1 || wmo === 2) return "2";
    if (wmo === 3) return "6";
    return "1";
}

app.get('/localweather/v1/:location', async (req, res) => {
    try {
        const [lat, lon] = req.params.location.split('_');
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto`;
        const response = await axios.get(url);
        const data = response.data;
        const daily = [];

        for (let i = 0; i < 7; i++) {
            daily.push({
                "MobileLink": "http://www.accuweather.com/",
                "Temperature": {
                    "Minimum": { "Value": Math.round(data.daily.temperature_2m_min[i]) },
                    "Maximum": { "Value": Math.round(data.daily.temperature_2m_max[i]) }
                },
                "Sun": {
                    "Rise": data.daily.sunrise[i],
                    "Set": data.daily.sunset[i]
                },
                "Day": {
                    "Icon": parseInt(getIcon(data.daily.weather_code[i])),
                    "Rain": { "Value": 0.0 },
                    "Snow": { "Value": 0.0 },
                    "Ice": { "Value": 0.0 },
                    "TotalLiquid": { "Value": 0.0 },
                    "RainProbability": 0,
                    "SnowProbability": 0,
                    "IceProbability": 0,
                    "PrecipitationProbability": 0
                },
                "Night": {
                    "Icon": parseInt(getIcon(data.daily.weather_code[i])),
                    "Rain": { "Value": 0.0 },
                    "Snow": { "Value": 0.0 },
                    "Ice": { "Value": 0.0 },
                    "TotalLiquid": { "Value": 0.0 },
                    "RainProbability": 0,
                    "SnowProbability": 0,
                    "IceProbability": 0,
                    "PrecipitationProbability": 0
                }
            });
        }

        const json = {
            "Location": {
                "Key": req.params.location,
                "TimeZone": { "GmtOffset": "0.0", "IsDaylightSaving": "False" },
                "Country": { "LocalizedName": "N/A" },
                "AdministrativeArea": { "LocalizedName": "N/A" },
                "GeoPosition": { "Latitude": lat, "Longitude": lon }
            },
            "CurrentConditions": {
                "WeatherText": "Despejado",
                "WeatherIcon": getIcon(data.current.weather_code),
                "Temperature": { "Value": Math.round(data.current.temperature_2m) },
                "RealFeelTemperature": { "Value": Math.round(data.current.temperature_2m) },
                "MobileLink": "http://www.accuweather.com/",
                "RelativeHumidity": "50",
                "UVIndex": 3,
                "UVIndexText": "Moderado",
                "Photos": [{
                    "Source": "Samsung",
                    "Description": "Clima",
                    "PortraitLink": "http://developer.accuweather.com/sites/default/files/01-s.png",
                    "LandscapeLink": "http://developer.accuweather.com/sites/default/files/01-s.png"
                }]
            },
            "ForecastSummary": {
                "DailyForecasts": daily
            }
        };

        res.json(json);
    } catch (error) {
        res.status(500).json({ error: "Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT);

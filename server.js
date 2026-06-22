// Micro-servidor traductor para revivir el widget de clima de Samsung (2014)
// Desarrollado en Node.js puro (sin dependencias externas)

const http = require('http');
const https = require('https');
const url = require('url');

// Configuración del servidor (Render asigna dinámicamente el puerto usando process.env.PORT)
const PORT = process.env.PORT || 8080; 
const DEFAULT_LAT = "40.7128"; // Nueva York por defecto si el widget no envía coordenadas
const DEFAULT_LON = "-74.0060";

// Diccionario multi-idioma para los códigos de clima de Open-Meteo
const CLIMA_CODIGOS = {
    es: {
        0: "Despejado",
        1: "Principalmente despejado", 2: "Parcialmente nublado", 3: "Nublado",
        45: "Niebla", 48: "Niebla escarchada",
        51: "Llovizna ligera", 53: "Llovizna moderada", 55: "Llovizna densa",
        61: "Lluvia débil", 63: "Lluvia moderada", 65: "Lluvia fuerte",
        71: "Nieve débil", 73: "Nieve moderada", 75: "Nieve fuerte",
        80: "Chubascos de lluvia débiles", 81: "Chubascos de lluvia moderados", 82: "Chubascos de lluvia violentos",
        95: "Tormenta eléctrica", 96: "Tormenta con granizo débil", 99: "Tormenta con granizo fuerte"
    },
    en: {
        0: "Clear sky",
        1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 48: "Depositing rime fog",
        51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
        61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
        71: "Slight snow fall", 73: "Moderate snow fall", 75: "Heavy snow fall",
        80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
        95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail"
    },
    pt: {
        0: "Céu limpo",
        1: "Principalmente limpo", 2: "Parcialmente nublado", 3: "Encoberto",
        45: "Nevoeiro", 48: "Nevoeiro com formação de geada",
        51: "Chuvisco leve", 53: "Chuvisco moderado", 55: "Chuvisco denso",
        61: "Chuva fraca", 63: "Chuva moderada", 65: "Chuva forte",
        71: "Queda de neve leve", 73: "Queda de neve moderada", 75: "Queda de neve forte",
        80: "Aguaceiros fracos", 81: "Aguaceiros moderados", 82: "Aguaceiros violentos",
        95: "Trovoada", 96: "Trovoada com granizo fraco", 99: "Trovoada com granizo forte"
    }
};

// Función auxiliar para realizar peticiones HTTPS (a Open-Meteo)
function fetchJSON(apiUrl) {
    return new Promise((resolve, reject) => {
        https.get(apiUrl, { headers: { 'User-Agent': 'SamsungWeatherProxy/1.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Generador de XML estilo AccuWeather (2014)
function generarXMLAccuWeather(temp, condicion, ciudad = "Mi Ciudad") {
    return `<?xml version="1.0" encoding="utf-8" ?>
<adc_database>
  <local>
    <city>${ciudad}</city>
    <adminArea code="LOCAL">Proxy Server</adminArea>
    <country code="LOC">Proxy</country>
  </local>
  <currentconditions>
    <temperature>${Math.round(temp)}</temperature>
    <weathertext>${condicion}</weathertext>
    <humidity>60</humidity>
    <windspeed>10</windspeed>
    <winddirection>N</winddirection>
    <pressure>1013</pressure>
    <realfeel>${Math.round(temp)}</realfeel>
  </currentconditions>
</adc_database>`;
}

// Generador de JSON estilo AccuWeather (2014) por si acaso el widget prefiere JSON
function generarJSONAccuWeather(temp, condicion, ciudad = "Mi Ciudad") {
    return JSON.stringify({
        Local: {
            City: ciudad
        },
        CurrentConditions: {
            Temperature: Math.round(temp),
            WeatherText: condicion,
            RealFeel: Math.round(temp),
            Humidity: "60"
        }
    });
}

// Crear el servidor HTTP
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    console.log(`[Petición recibida] ${req.method} ${parsedUrl.pathname}`);

    // Permitir CORS por si el widget lo requiere
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        // Intentamos extraer latitud y longitud si el widget las envía en la URL
        let lat = parsedUrl.query.lat || parsedUrl.query.latitude || DEFAULT_LAT;
        let lon = parsedUrl.query.lon || parsedUrl.query.longitude || DEFAULT_LON;

        // Detectar idioma preferido del dispositivo
        let idioma = "es"; // Por defecto en español
        const parametroIdioma = parsedUrl.query.lang || parsedUrl.query.locale || parsedUrl.query.language || req.headers['accept-language'];
        
        if (parametroIdioma) {
            // Extraer las dos primeras letras (ej. "en-US" -> "en")
            const match = parametroIdioma.toLowerCase().match(/^([a-z]{2})/);
            if (match && CLIMA_CODIGOS[match[1]]) {
                idioma = match[1];
                console.log(` -> Idioma detectado en dispositivo: ${idioma.toUpperCase()}`);
            } else {
                // Si el idioma no está soportado en nuestro diccionario, usar inglés por seguridad
                idioma = "en";
            }
        }

        // Llamar a la API de Open-Meteo
        const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
        const weatherData = await fetchJSON(openMeteoUrl);

        if (!weatherData.current_weather) {
            throw new Error("No se recibieron datos válidos de Open-Meteo");
        }

        const temp = weatherData.current_weather.temperature;
        const codigoClima = weatherData.current_weather.weathercode;
        
        // Obtener la condición traducida según el idioma del dispositivo
        const condicion = CLIMA_CODIGOS[idioma][codigoClima] || CLIMA_CODIGOS[idioma][0];

        // Detectar si el widget pide XML o JSON basándonos en la ruta o cabeceras
        const quiereXML = parsedUrl.pathname.includes('.asp') || 
                          parsedUrl.pathname.includes('.xml') || 
                          (req.headers.accept && req.headers.accept.includes('xml'));

        if (quiereXML) {
            console.log(` -> Respondiendo con XML (Temp: ${temp}°C, Condición: ${condicion})`);
            res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
            res.end(generarXMLAccuWeather(temp, condicion));
        } else {
            console.log(` -> Respondiendo con JSON (Temp: ${temp}°C, Condición: ${condicion})`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(generarJSONAccuWeather(temp, condicion));
        }

    } catch (error) {
        console.error(" Error procesando el clima:", error.message);
        // Respuesta de emergencia para evitar que el widget crashee por completo
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end(generarXMLAccuWeather(20, "Servicio en Mantenimiento"));
    }
});

// Iniciar servidor
server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  MICRO-SERVIDOR ACCUWEATHER PROXY ACTIVO`);
    console.log(`  Escuchando en el puerto: ${PORT}`);
    console.log(`  Para pruebas en el navegador: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
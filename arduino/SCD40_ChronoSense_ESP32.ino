/*
 * SCD40/41 CO2 Sensor for ChronoSense
 * Arduino ESP32 Implementation
 * 
 * Compatible with ChronoSense data acquisition system
 * Supports WiFi direct connection and USB serial fallback
 * 
 * Hardware Connections:
 * - SCD40/41: SDA -> GPIO21, SCL -> GPIO22, VCC -> 3.3V, GND -> GND
 * - Optional OLED: SDA -> GPIO21, SCL -> GPIO22 (shared I2C bus)
 * 
 * Author: St. Mary's Edenderry
 * Date: November 2025
 * Version: 1.0
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <Wire.h>
#include <SensirionI2CScd4x.h>
#include <ArduinoJson.h>

// Optional OLED display support
#define USE_OLED true
#if USE_OLED
#include <Adafruit_SSD1306.h>
#include <Adafruit_GFX.h>
#endif

// Network Configuration
const char* WIFI_SSID = "YourWiFiNetwork";
const char* WIFI_PASSWORD = "YourWiFiPassword";
const char* CHRONOSENSE_HOST = "192.168.1.100";  // ChronoSense computer IP
const int CHRONOSENSE_PORT = 8080;

// Device Configuration
const String DEVICE_NAME = "CO2-Sensor-ESP32";
const int READING_INTERVAL = 5000;  // 5 seconds
const int RADIO_CHANNEL = 144;      // Match micro:bit channel

// Global objects
SensirionI2CScd4x scd4x;
WebSocketsClient webSocket;

#if USE_OLED
Adafruit_SSD1306 display(128, 64, &Wire, -1);
#endif

// State variables
bool wifiConnected = false;
bool sensorReady = false;
bool websocketConnected = false;
unsigned long lastReading = 0;
unsigned long lastDisplayUpdate = 0;

// Sensor data
struct SensorData {
    uint16_t co2;
    float temperature;
    float humidity;
    bool valid;
    unsigned long timestamp;
};

// Function prototypes
void setupWiFi();
void setupSensor();
void setupDisplay();
void setupWebSocket();
bool readSensorData(SensorData& data);
int calculateChecksum(uint16_t co2, float temp, float humidity);
void transmitData(const SensorData& data);
void updateDisplay(const SensorData& data);
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length);
void sendSerialData(const SensorData& data);

void setup() {
    Serial.begin(115200);
    Wire.begin();
    
    delay(2000);
    Serial.println("\n=== SCD40 ChronoSense Sensor Starting ===");
    Serial.println("Device: " + DEVICE_NAME);
    Serial.println("Channel: " + String(RADIO_CHANNEL));
    
    // Initialize components
    setupDisplay();
    setupSensor();
    setupWiFi();
    setupWebSocket();
    
    Serial.println("=== Setup Complete ===\n");
    
    // Initial display update
    #if USE_OLED
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("CO2 Sensor Ready");
    display.println("WiFi: " + String(wifiConnected ? "OK" : "Failed"));
    display.println("Sensor: " + String(sensorReady ? "OK" : "Failed"));
    display.display();
    #endif
}

void loop() {
    // Handle WebSocket events
    if (websocketConnected) {
        webSocket.loop();
    }
    
    // Read sensor every READING_INTERVAL
    if (millis() - lastReading >= READING_INTERVAL) {
        SensorData data;
        if (readSensorData(data)) {
            transmitData(data);
            updateDisplay(data);
        }
        lastReading = millis();
    }
    
    // Update display every 2 seconds (if no new data)
    if (millis() - lastDisplayUpdate >= 2000) {
        #if USE_OLED
        // Update connection status on display
        display.fillRect(0, 56, 128, 8, BLACK);
        display.setCursor(0, 56);
        display.print("WiFi:");
        display.print(WiFi.status() == WL_CONNECTED ? "OK " : "-- ");
        display.print("WS:");
        display.print(websocketConnected ? "OK" : "--");
        display.display();
        #endif
        lastDisplayUpdate = millis();
    }
    
    // Small delay to prevent watchdog reset
    delay(10);
}

void setupWiFi() {
    Serial.println("Connecting to WiFi: " + String(WIFI_SSID));
    
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    WiFi.setHostname(DEVICE_NAME.c_str());
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        wifiConnected = true;
        Serial.println("\nWiFi Connected!");
        Serial.println("IP Address: " + WiFi.localIP().toString());
        Serial.println("Device Name: " + DEVICE_NAME);
    } else {
        wifiConnected = false;
        Serial.println("\nWiFi Connection Failed!");
        Serial.println("Will use Serial fallback mode.");
    }
}

void setupSensor() {
    Serial.println("Initializing SCD40 sensor...");
    
    scd4x.begin(Wire);
    
    // Stop potentially previously started measurement
    uint16_t error = scd4x.stopPeriodicMeasurement();
    if (error) {
        Serial.println("Error stopping periodic measurement: " + String(error));
    }
    
    // Get sensor info
    uint16_t serial0, serial1, serial2;
    error = scd4x.getSerialNumber(serial0, serial1, serial2);
    if (error) {
        Serial.println("Error reading serial number: " + String(error));
    } else {
        Serial.print("Serial Number: 0x");
        Serial.print(serial0, HEX);
        Serial.print(serial1, HEX);
        Serial.println(serial2, HEX);
    }
    
    // Start periodic measurement
    error = scd4x.startPeriodicMeasurement();
    if (error) {
        Serial.println("Error starting periodic measurement: " + String(error));
        sensorReady = false;
    } else {
        Serial.println("SCD40 sensor initialized successfully!");
        sensorReady = true;
    }
}

void setupDisplay() {
    #if USE_OLED
    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println("OLED display initialization failed!");
        return;
    }
    
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(WHITE);
    display.setCursor(0, 0);
    display.println("SCD40 ChronoSense");
    display.println("Initializing...");
    display.display();
    
    Serial.println("OLED display initialized");
    #else
    Serial.println("OLED display disabled");
    #endif
}

void setupWebSocket() {
    if (!wifiConnected) {
        Serial.println("Skipping WebSocket setup - no WiFi");
        return;
    }
    
    Serial.println("Setting up WebSocket connection...");
    Serial.println("Target: ws://" + String(CHRONOSENSE_HOST) + ":" + String(CHRONOSENSE_PORT));
    
    webSocket.begin(CHRONOSENSE_HOST, CHRONOSENSE_PORT, "/");
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
    
    Serial.println("WebSocket configured");
}

bool readSensorData(SensorData& data) {
    if (!sensorReady) {
        return false;
    }
    
    bool isDataReady = false;
    uint16_t error = scd4x.getDataReadyFlag(isDataReady);
    
    if (error) {
        Serial.println("Error checking data ready flag: " + String(error));
        return false;
    }
    
    if (!isDataReady) {
        return false;
    }
    
    error = scd4x.readMeasurement(data.co2, data.temperature, data.humidity);
    
    if (error) {
        Serial.println("Error reading measurement: " + String(error));
        data.valid = false;
        return false;
    }
    
    // Validate readings
    data.valid = (data.co2 > 0 && data.co2 < 40000) &&
                 (data.temperature > -40 && data.temperature < 85) &&
                 (data.humidity >= 0 && data.humidity <= 100);
    
    data.timestamp = millis();
    
    if (!data.valid) {
        Serial.println("Invalid sensor reading detected");
        Serial.println("CO2: " + String(data.co2) + "ppm");
        Serial.println("Temp: " + String(data.temperature) + "°C");
        Serial.println("Humidity: " + String(data.humidity) + "%");
    }
    
    return data.valid;
}

int calculateChecksum(uint16_t co2, float temp, float humidity) {
    // Use the same modSum method as micro:bit
    int co2Ones = abs((int)co2) % 10;
    int tempOnes = abs((int)temp) % 10;
    int humidOnes = abs((int)humidity) % 10;
    
    return (co2Ones + tempOnes + humidOnes) % 10;
}

void transmitData(const SensorData& data) {
    if (!data.valid) {
        return;
    }
    
    int checksum = calculateChecksum(data.co2, data.temperature, data.humidity);
    
    // Create CSV data string - same format as micro:bit
    String csvData = String(data.co2) + "," + 
                    String(data.temperature, 1) + "," + 
                    String(data.humidity, 1) + "," + 
                    String(checksum);
    
    // Try WebSocket first, fallback to Serial
    if (websocketConnected) {
        // Send as WebSocket message
        DynamicJsonDocument doc(200);
        doc["type"] = "sensor_data";
        doc["device"] = DEVICE_NAME;
        doc["channel"] = RADIO_CHANNEL;
        doc["data"] = csvData;
        doc["timestamp"] = data.timestamp;
        
        String message;
        serializeJson(doc, message);
        webSocket.sendTXT(message);
        
        Serial.println("WebSocket -> " + csvData);
    } else {
        // Send to serial (for ChronoSense serial connection)
        sendSerialData(data);
    }
}

void sendSerialData(const SensorData& data) {
    int checksum = calculateChecksum(data.co2, data.temperature, data.humidity);
    
    // Send exactly the same format as micro:bit
    String csvData = String(data.co2) + "," + 
                    String(data.temperature, 1) + "," + 
                    String(data.humidity, 1) + "," + 
                    String(checksum);
    
    Serial.println(csvData);
    
    // Optional: Send to Serial1 if you want to use a separate serial port
    // Serial1.println(csvData);
}

void updateDisplay(const SensorData& data) {
    #if USE_OLED
    if (!data.valid) return;
    
    display.clearDisplay();
    
    // Title
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("CO2 Environmental");
    
    // CO2 reading (large)
    display.setTextSize(2);
    display.setCursor(0, 16);
    display.print(String(data.co2));
    display.println(" ppm");
    
    // Temperature and Humidity (small)
    display.setTextSize(1);
    display.setCursor(0, 40);
    display.println("Temp: " + String(data.temperature, 1) + "C");
    display.println("Hum:  " + String(data.humidity, 1) + "%");
    
    // Connection status will be updated separately
    
    display.display();
    #endif
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            websocketConnected = false;
            Serial.println("WebSocket Disconnected");
            break;
            
        case WStype_CONNECTED:
            websocketConnected = true;
            Serial.println("WebSocket Connected to: " + String((char*)payload));
            
            // Send device identification
            DynamicJsonDocument doc(150);
            doc["type"] = "device_info";
            doc["device"] = DEVICE_NAME;
            doc["sensor"] = "SCD40";
            doc["channel"] = RADIO_CHANNEL;
            doc["version"] = "1.0";
            
            String message;
            serializeJson(doc, message);
            webSocket.sendTXT(message);
            break;
            
        case WStype_TEXT:
            Serial.println("Received: " + String((char*)payload));
            // Handle commands from ChronoSense if needed
            break;
            
        case WStype_ERROR:
            websocketConnected = false;
            Serial.println("WebSocket Error");
            break;
            
        default:
            break;
    }
}

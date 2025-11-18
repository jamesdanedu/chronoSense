/*
 * chronoSenseArduino.cpp
 * 
 * Implementation of ChronoSense Arduino library
 * Provides multiple transmission methods for sensor data
 * 
 * Author: St. Mary's Edenderry
 * Version: 1.0
 * Date: November 2025
 */

#include "ChronoSenseArduino.h"

// Static instance for WebSocket callbacks
ChronoSense* ChronoSense::instance = nullptr;

ChronoSense::ChronoSense(ChronoSenseMode mode) {
    this->mode = mode;
    this->deviceName = "Arduino-Sensor";
    this->radioChannel = 144;
    this->checksumEnabled = true;
    this->validation = VALIDATE_CHECKSUM;
    this->transmissionInterval = 5000;
    this->connected = false;
    this->bufferEnabled = false;
    this->bufferIndex = 0;
    this->lastTransmission = 0;
    this->connectionTimeout = 30000;
    this->serverPort = 8080;
    
    // Initialize callback pointers
    this->onConnectCallback = nullptr;
    this->onDisconnectCallback = nullptr;
    this->onDataSentCallback = nullptr;
    this->onErrorCallback = nullptr;
    
    #ifdef ESP32
    this->webSocket = nullptr;
    this->bluetooth = nullptr;
    #endif
    
    // Set static instance for callbacks
    ChronoSense::instance = this;
}

ChronoSense::~ChronoSense() {
    #ifdef ESP32
    if (webSocket != nullptr) {
        delete webSocket;
    }
    if (bluetooth != nullptr) {
        delete bluetooth;
    }
    #endif
}

bool ChronoSense::begin() {
    return begin(this->deviceName);
}

bool ChronoSense::begin(String deviceName) {
    this->deviceName = deviceName;
    
    CS_DEBUG_PRINTLN("ChronoSense: Initializing " + deviceName);
    CS_DEBUG_PRINTLN("Mode: " + String(mode));
    CS_DEBUG_PRINTLN("Channel: " + String(radioChannel));
    
    switch (mode) {
        case CS_USB_SERIAL:
            Serial.begin(115200);
            connected = true;
            CS_DEBUG_PRINTLN("USB Serial initialized");
            break;
            
        case CS_WIFI_WEBSOCKET:
        case CS_WIFI_TCP:
            #ifdef ESP32
            if (wifiSSID.length() == 0) {
                CS_DEBUG_PRINTLN("Error: WiFi credentials not set");
                return false;
            }
            return connectWiFi();
            #else
            CS_DEBUG_PRINTLN("Error: WiFi not supported on this board");
            return false;
            #endif
            break;
            
        case CS_BLUETOOTH:
            #ifdef ESP32
            bluetooth = new BluetoothSerial();
            if (!bluetooth->begin(deviceName)) {
                CS_DEBUG_PRINTLN("Error: Bluetooth initialization failed");
                return false;
            }
            connected = true;
            CS_DEBUG_PRINTLN("Bluetooth initialized as: " + deviceName);
            #else
            CS_DEBUG_PRINTLN("Error: Bluetooth not supported on this board");
            return false;
            #endif
            break;
            
        case CS_RADIO_NRF24:
            // TODO: Implement nRF24L01+ support for Arduino Uno/Nano
            CS_DEBUG_PRINTLN("Error: nRF24 not implemented yet");
            return false;
            break;
            
        default:
            CS_DEBUG_PRINTLN("Error: Unknown transmission mode");
            return false;
    }
    
    if (connected && onConnectCallback != nullptr) {
        onConnectCallback();
    }
    
    return connected;
}

void ChronoSense::setWiFi(String ssid, String password) {
    this->wifiSSID = ssid;
    this->wifiPassword = password;
}

void ChronoSense::setServer(String host, int port) {
    this->serverHost = host;
    this->serverPort = port;
}

bool ChronoSense::connectWiFi() {
    #ifdef ESP32
    CS_DEBUG_PRINTLN("Connecting to WiFi: " + wifiSSID);
    
    WiFi.begin(wifiSSID.c_str(), wifiPassword.c_str());
    WiFi.setHostname(deviceName.c_str());
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        CS_DEBUG_PRINT(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        CS_DEBUG_PRINTLN("\nWiFi connected: " + WiFi.localIP().toString());
        
        if (mode == CS_WIFI_WEBSOCKET) {
            return connectWebSocket();
        }
        
        connected = true;
        return true;
    } else {
        CS_DEBUG_PRINTLN("\nWiFi connection failed");
        connected = false;
        if (onErrorCallback != nullptr) {
            onErrorCallback("WiFi connection failed");
        }
        return false;
    }
    #else
    return false;
    #endif
}

bool ChronoSense::connectWebSocket() {
    #ifdef ESP32
    if (serverHost.length() == 0) {
        CS_DEBUG_PRINTLN("Error: Server host not set");
        return false;
    }
    
    if (webSocket != nullptr) {
        delete webSocket;
    }
    
    webSocket = new WebSocketsClient();
    webSocket->begin(serverHost.c_str(), serverPort, "/");
    webSocket->onEvent(webSocketEventWrapper);
    webSocket->setReconnectInterval(5000);
    
    CS_DEBUG_PRINTLN("WebSocket configured for: " + serverHost + ":" + String(serverPort));
    
    // Wait for connection
    unsigned long startTime = millis();
    while (!connected && (millis() - startTime) < connectionTimeout) {
        webSocket->loop();
        delay(100);
    }
    
    return connected;
    #else
    return false;
    #endif
}

int ChronoSense::calculateModSum(float values[], int count) {
    int sum = 0;
    for (int i = 0; i < count; i++) {
        sum += abs((int)values[i]) % 10;
    }
    return sum % 10;
}

int ChronoSense::calculateModSum(int values[], int count) {
    int sum = 0;
    for (int i = 0; i < count; i++) {
        sum += abs(values[i]) % 10;
    }
    return sum % 10;
}

String ChronoSense::formatCSVData(String sensorType, float values[], int count) {
    String csv = "";
    
    // Add sensor values
    for (int i = 0; i < count; i++) {
        if (i > 0) csv += ",";
        csv += String(values[i], 1);
    }
    
    // Add checksum if enabled
    if (checksumEnabled) {
        int checksum = calculateModSum(values, count);
        csv += "," + String(checksum);
    }
    
    return csv;
}

bool ChronoSense::sendSensorData(String sensorType, float values[], int count) {
    if (!connected || count <= 0 || count > 10) {
        return false;
    }
    
    // Validate data if required
    if (validation >= VALIDATE_BASIC) {
        if (!validateSensorData(values, count, sensorType)) {
            CS_DEBUG_PRINTLN("Data validation failed for " + sensorType);
            return false;
        }
    }
    
    // Format data
    String csvData = formatCSVData(sensorType, values, count);
    
    // Transmit
    transmitString(csvData);
    
    // Update last transmission time
    lastTransmission = millis();
    
    // Call callback if set
    if (onDataSentCallback != nullptr) {
        onDataSentCallback(csvData);
    }
    
    return true;
}

bool ChronoSense::sendSensorData(String sensorType, float value) {
    float values[] = {value};
    return sendSensorData(sensorType, values, 1);
}

bool ChronoSense::sendRawCSV(String csvData) {
    if (!connected) return false;
    
    transmitString(csvData);
    lastTransmission = millis();
    
    if (onDataSentCallback != nullptr) {
        onDataSentCallback(csvData);
    }
    
    return true;
}

void ChronoSense::transmitString(String data) {
    switch (mode) {
        case CS_USB_SERIAL:
            Serial.println(data);
            break;
            
        case CS_WIFI_WEBSOCKET:
            #ifdef ESP32
            if (webSocket != nullptr && connected) {
                // Create JSON message
                DynamicJsonDocument doc(300);
                doc["type"] = "sensor_data";
                doc["device"] = deviceName;
                doc["channel"] = radioChannel;
                doc["data"] = data;
                doc["timestamp"] = millis();
                
                String message;
                serializeJson(doc, message);
                webSocket->sendTXT(message);
                
                CS_DEBUG_PRINTLN("WebSocket -> " + data);
            }
            #endif
            break;
            
        case CS_BLUETOOTH:
            #ifdef ESP32
            if (bluetooth != nullptr) {
                bluetooth->println(data);
                CS_DEBUG_PRINTLN("Bluetooth -> " + data);
            }
            #endif
            break;
            
        case CS_WIFI_TCP:
            // TODO: Implement TCP socket transmission
            break;
            
        case CS_RADIO_NRF24:
            // TODO: Implement nRF24L01+ transmission
            break;
    }
}

// Specialized sensor methods
bool ChronoSense::sendCO2Data(int co2, float temperature, float humidity) {
    float values[] = {(float)co2, temperature, humidity};
    return sendSensorData("CO2", values, 3);
}

bool ChronoSense::sendTemperatureData(float temperature) {
    return sendSensorData("Temperature", temperature);
}

bool ChronoSense::sendAccelerometerData(int x, int y, int z) {
    float values[] = {(float)x, (float)y, (float)z};
    return sendSensorData("Accelerometer", values, 3);
}

bool ChronoSense::sendDistanceData(float distance) {
    return sendSensorData("Distance", distance);
}

bool ChronoSense::sendEnvironmentalData(float temp, float humidity, float pressure) {
    float values[] = {temp, humidity, pressure};
    return sendSensorData("Environmental", values, 3);
}

// Status methods
bool ChronoSense::isConnected() {
    switch (mode) {
        case CS_USB_SERIAL:
            return Serial;
            
        case CS_WIFI_WEBSOCKET:
        case CS_WIFI_TCP:
            #ifdef ESP32
            return WiFi.status() == WL_CONNECTED && connected;
            #endif
            break;
            
        case CS_BLUETOOTH:
            #ifdef ESP32
            return bluetooth != nullptr && bluetooth->connected();
            #endif
            break;
    }
    return connected;
}

String ChronoSense::getConnectionStatus() {
    switch (mode) {
        case CS_USB_SERIAL:
            return Serial ? "USB Connected" : "USB Disconnected";
            
        case CS_WIFI_WEBSOCKET:
            #ifdef ESP32
            if (WiFi.status() != WL_CONNECTED) {
                return "WiFi Disconnected";
            }
            return connected ? "WebSocket Connected" : "WebSocket Disconnected";
            #endif
            break;
            
        case CS_WIFI_TCP:
            #ifdef ESP32
            if (WiFi.status() != WL_CONNECTED) {
                return "WiFi Disconnected";
            }
            return connected ? "TCP Connected" : "TCP Disconnected";
            #endif
            break;
            
        case CS_BLUETOOTH:
            #ifdef ESP32
            return bluetooth && bluetooth->connected() ? "Bluetooth Connected" : "Bluetooth Disconnected";
            #endif
            break;
    }
    return "Unknown";
}

String ChronoSense::getDeviceInfo() {
    String info = "Device: " + deviceName + "\n";
    info += "Mode: ";
    
    switch (mode) {
        case CS_USB_SERIAL: info += "USB Serial"; break;
        case CS_WIFI_WEBSOCKET: info += "WiFi WebSocket"; break;
        case CS_WIFI_TCP: info += "WiFi TCP"; break;
        case CS_BLUETOOTH: info += "Bluetooth"; break;
        case CS_RADIO_NRF24: info += "nRF24L01+"; break;
    }
    
    info += "\nChannel: " + String(radioChannel);
    info += "\nChecksum: " + String(checksumEnabled ? "Enabled" : "Disabled");
    info += "\nStatus: " + getConnectionStatus();
    
    #ifdef ESP32
    if (mode == CS_WIFI_WEBSOCKET || mode == CS_WIFI_TCP) {
        info += "\nIP: " + WiFi.localIP().toString();
        info += "\nRSSI: " + String(WiFi.RSSI()) + " dBm";
    }
    #endif
    
    info += "\nVersion: " + getVersion();
    
    return info;
}

void ChronoSense::printDiagnostics() {
    CS_DEBUG_PRINTLN("=== ChronoSense Diagnostics ===");
    CS_DEBUG_PRINTLN(getDeviceInfo());
    CS_DEBUG_PRINTLN("Last transmission: " + String((millis() - lastTransmission) / 1000) + "s ago");
    CS_DEBUG_PRINTLN("==============================");
}

String ChronoSense::getVersion() {
    return String(CHRONOSENSE_ARDUINO_VERSION);
}

bool ChronoSense::validateSensorData(float values[], int count, String sensorType) {
    for (int i = 0; i < count; i++) {
        if (isnan(values[i]) || isinf(values[i])) {
            return false;
        }
    }
    
    // Sensor-specific validation
    if (sensorType == "CO2" && count >= 3) {
        // CO2: 0-50000 ppm, Temp: -40 to 85°C, Humidity: 0-100%
        return (values[0] >= 0 && values[0] <= 50000) &&
               (values[1] >= -40 && values[1] <= 85) &&
               (values[2] >= 0 && values[2] <= 100);
    }
    
    if (sensorType == "Temperature") {
        // Temperature: -40 to 125°C
        return values[0] >= -40 && values[0] <= 125;
    }
    
    if (sensorType == "Distance") {
        // Distance: 0 to 400 cm
        return values[0] >= 0 && values[0] <= 400;
    }
    
    return true;
}

// WebSocket event handler
#ifdef ESP32
void ChronoSense::webSocketEventWrapper(WStype_t type, uint8_t* payload, size_t length) {
    if (ChronoSense::instance != nullptr) {
        ChronoSense::instance->handleWebSocketEvent(type, payload, length);
    }
}

void ChronoSense::handleWebSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            connected = false;
            CS_DEBUG_PRINTLN("WebSocket Disconnected");
            if (onDisconnectCallback != nullptr) {
                onDisconnectCallback();
            }
            break;
            
        case WStype_CONNECTED:
            connected = true;
            CS_DEBUG_PRINTLN("WebSocket Connected");
            
            // Send device identification
            DynamicJsonDocument doc(200);
            doc["type"] = "device_info";
            doc["device"] = deviceName;
            doc["channel"] = radioChannel;
            doc["version"] = getVersion();
            
            String message;
            serializeJson(doc, message);
            webSocket->sendTXT(message);
            
            if (onConnectCallback != nullptr) {
                onConnectCallback();
            }
            break;
            
        case WStype_TEXT:
            CS_DEBUG_PRINTLN("Received: " + String((char*)payload));
            break;
            
        case WStype_ERROR:
            connected = false;
            CS_DEBUG_PRINTLN("WebSocket Error");
            if (onErrorCallback != nullptr) {
                onErrorCallback("WebSocket error");
            }
            break;
    }
}
#endif

// Utility namespace implementations
namespace ChronoSenseUtils {
    int calculateChecksum(float values[], int count) {
        int sum = 0;
        for (int i = 0; i < count; i++) {
            sum += abs((int)values[i]) % 10;
        }
        return sum % 10;
    }
    
    int calculateChecksum(int values[], int count) {
        int sum = 0;
        for (int i = 0; i < count; i++) {
            sum += abs(values[i]) % 10;
        }
        return sum % 10;
    }
    
    bool validateRange(float value, float min, float max) {
        return value >= min && value <= max && !isnan(value) && !isinf(value);
    }
    
    String formatTimestamp() {
        unsigned long ms = millis();
        unsigned long seconds = ms / 1000;
        unsigned long minutes = seconds / 60;
        unsigned long hours = minutes / 60;
        
        ms = ms % 1000;
        seconds = seconds % 60;
        minutes = minutes % 60;
        hours = hours % 24;
        
        char timestamp[13];
        sprintf(timestamp, "%02lu:%02lu:%02lu.%03lu", hours, minutes, seconds, ms);
        return String(timestamp);
    }
}

// Specialized sensor class implementations
CO2Sensor::CO2Sensor(ChronoSense* cs) {
    chronoSense = cs;
}

bool CO2Sensor::sendReading(int co2, float temperature, float humidity) {
    return chronoSense->sendCO2Data(co2, temperature, humidity);
}

bool CO2Sensor::sendReading(int co2) {
    float values[] = {(float)co2};
    return chronoSense->sendSensorData("CO2", values, 1);
}

TemperatureSensor::TemperatureSensor(ChronoSense* cs) {
    chronoSense = cs;
}

bool TemperatureSensor::sendReading(float temperature) {
    return chronoSense->sendTemperatureData(temperature);
}

bool TemperatureSensor::sendReading(float temperature, float humidity) {
    float values[] = {temperature, humidity};
    return chronoSense->sendSensorData("Temperature", values, 2);
}

DistanceSensor::DistanceSensor(ChronoSense* cs) {
    chronoSense = cs;
}

bool DistanceSensor::sendReading(float distance) {
    return chronoSense->sendDistanceData(distance);
}

bool DistanceSensor::sendReading(float distance, float confidence) {
    float values[] = {distance, confidence};
    return chronoSense->sendSensorData("Distance", values, 2);
}

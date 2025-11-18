/*
 * chronoSenseArduino.h
 * 
 * Arduino library for ChronoSense data acquisition system
 * Provides standardized sensor data transmission methods
 * 
 * Supports multiple transmission modes:
 * - WiFi WebSocket (direct to ChronoSense web app)
 * - WiFi TCP (to ChronoSense receiver)
 * - Bluetooth Serial
 * - USB Serial (micro:bit compatible)
 * 
 * Compatible with ChronoSense checksum validation
 * 
 * Author: St. Mary's Edenderry
 * Version: 1.0
 * Date: November 2025
 */

#ifndef CHRONOSENSE_ARDUINO_H
#define CHRONOSENSE_ARDUINO_H

#include <Arduino.h>

// WiFi support for ESP32/ESP8266
#ifdef ESP32
    #include <WiFi.h>
    #include <WebSocketsClient.h>
#elif defined(ESP8266)
    #include <ESP8266WiFi.h>
    #include <WebSocketsClient.h>
#endif

// Bluetooth support for ESP32
#ifdef ESP32
    #include <BluetoothSerial.h>
#endif

#include <ArduinoJson.h>

// Transmission modes
enum ChronoSenseMode {
    CS_USB_SERIAL,        // USB serial (like micro:bit)
    CS_WIFI_WEBSOCKET,    // WebSocket to ChronoSense web app
    CS_WIFI_TCP,          // TCP socket to ChronoSense receiver
    CS_BLUETOOTH,         // Bluetooth serial
    CS_RADIO_NRF24        // nRF24L01+ radio (Arduino Uno/Nano)
};

// Data validation levels
enum ValidationLevel {
    VALIDATE_NONE,        // No validation
    VALIDATE_BASIC,       // Range checking only
    VALIDATE_CHECKSUM,    // Include checksum validation
    VALIDATE_FULL         // All validation methods
};

class ChronoSense {
private:
    // Configuration
    ChronoSenseMode mode;
    String deviceName;
    int radioChannel;
    bool checksumEnabled;
    ValidationLevel validation;
    int transmissionInterval;
    
    // Network settings
    String wifiSSID;
    String wifiPassword;
    String serverHost;
    int serverPort;
    
    // Communication objects
    #ifdef ESP32
    WebSocketsClient* webSocket;
    BluetoothSerial* bluetooth;
    #endif
    
    // Status tracking
    bool connected;
    unsigned long lastTransmission;
    unsigned long connectionTimeout;
    
    // Data buffering
    static const int BUFFER_SIZE = 10;
    String dataBuffer[BUFFER_SIZE];
    int bufferIndex;
    bool bufferEnabled;
    
    // Internal methods
    int calculateModSum(float values[], int count);
    int calculateModSum(int values[], int count);
    bool validateSensorData(float values[], int count, String sensorType);
    void bufferData(String data);
    void flushBuffer();
    String formatCSVData(String sensorType, float values[], int count);
    void transmitString(String data);
    
    #ifdef ESP32
    void handleWebSocketEvent(WStype_t type, uint8_t* payload, size_t length);
    static void webSocketEventWrapper(WStype_t type, uint8_t* payload, size_t length);
    #endif
    
public:
    // Constructor
    ChronoSense(ChronoSenseMode mode = CS_USB_SERIAL);
    ~ChronoSense();
    
    // Basic setup
    bool begin();
    bool begin(String deviceName);
    void setDeviceName(String name);
    void setRadioChannel(int channel);
    
    // Network configuration (ESP32/ESP8266 only)
    void setWiFi(String ssid, String password);
    void setServer(String host, int port);
    bool connectWiFi();
    bool connectWebSocket();
    
    // Transmission settings
    void enableChecksum(bool enable = true);
    void setValidationLevel(ValidationLevel level);
    void setTransmissionInterval(int milliseconds);
    void enableDataBuffering(bool enable = true);
    
    // Data transmission methods
    bool sendSensorData(String sensorType, float value);
    bool sendSensorData(String sensorType, float values[], int count);
    bool sendSensorData(String sensorType, int values[], int count);
    bool sendRawCSV(String csvData);
    
    // Specialized sensor methods
    bool sendCO2Data(int co2, float temperature, float humidity);
    bool sendTemperatureData(float temperature);
    bool sendAccelerometerData(int x, int y, int z);
    bool sendDistanceData(float distance);
    bool sendEnvironmentalData(float temp, float humidity, float pressure);
    
    // Status and diagnostics
    bool isConnected();
    String getConnectionStatus();
    String getDeviceInfo();
    int getSignalStrength(); // WiFi RSSI or Bluetooth signal
    unsigned long getLastTransmissionTime();
    
    // Utility methods
    void printDiagnostics();
    void resetConnection();
    String getVersion();
    
    // Event callbacks (optional)
    void onConnect(void (*callback)());
    void onDisconnect(void (*callback)());
    void onDataSent(void (*callback)(String data));
    void onError(void (*callback)(String error));
    
private:
    // Callback function pointers
    void (*onConnectCallback)();
    void (*onDisconnectCallback)();
    void (*onDataSentCallback)(String data);
    void (*onErrorCallback)(String error);
    
    // Static instance for WebSocket callback
    static ChronoSense* instance;
};

// Utility classes for specific sensors
class SensorReading {
public:
    String sensorType;
    float values[10];  // Max 10 values per reading
    int valueCount;
    unsigned long timestamp;
    bool isValid;
    
    SensorReading(String type);
    void addValue(float value);
    void addValue(int value);
    void clear();
    bool validate();
};

// Pre-configured sensor classes
class CO2Sensor {
private:
    ChronoSense* chronoSense;
public:
    CO2Sensor(ChronoSense* cs);
    bool sendReading(int co2, float temperature, float humidity);
    bool sendReading(int co2);
};

class TemperatureSensor {
private:
    ChronoSense* chronoSense;
public:
    TemperatureSensor(ChronoSense* cs);
    bool sendReading(float temperature);
    bool sendReading(float temperature, float humidity);
};

class DistanceSensor {
private:
    ChronoSense* chronoSense;
public:
    DistanceSensor(ChronoSense* cs);
    bool sendReading(float distance);
    bool sendReading(float distance, float confidence);
};

// Global utility functions
namespace ChronoSenseUtils {
    int calculateChecksum(float values[], int count);
    int calculateChecksum(int values[], int count);
    bool validateRange(float value, float min, float max);
    String formatTimestamp();
    String formatDeviceInfo(String deviceName, String sensorType);
}

// Version information
#define CHRONOSENSE_ARDUINO_VERSION "1.0.0"
#define CHRONOSENSE_ARDUINO_COMPATIBLE_VERSION "1.1"

// Debug macros
#ifdef CS_DEBUG
#define CS_DEBUG_PRINT(x) Serial.print(x)
#define CS_DEBUG_PRINTLN(x) Serial.println(x)
#else
#define CS_DEBUG_PRINT(x)
#define CS_DEBUG_PRINTLN(x)
#endif

#endif // CHRONOSENSE_ARDUINO_H

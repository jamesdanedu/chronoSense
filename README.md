# ChronoSense 

![Alt text](chronoSense/webApp/AboutChronoSense.png)

ChronoSense is a data acquisition system designed specifically for science classrooms, enabling teachers and students to collect, visualize, and analyze data from Microbit devices paired with various sensors.

# Overview
This project contains two complementary tools:

# ChronoSense Web App
A browser-based interface for real-time data visualization
# ChronoSense CLI
A Python command-line application for long-term data logging

Both applications connect to a Microbit via USB serial connection and capture comma-separated data, automatically adapting to whatever sensor data is sent.

# Features

- Real-time data collection from Microbit devices
- Dynamic support for any type and number of sensor values
- Live visualization with interactive charts
- CSV export functionality for further analysis
- Automatic timestamping of all collected data
- Support for a wide range of sensor types and configurations
- Cross-platform compatibility (Windows, macOS, Linux)

# Web App Usage
The ChronoSense web app provides an intuitive graphical interface for real-time data visualization.

#Requirements

A modern web browser (Google Chrome or Microsoft Edge recommended)
A Microbit connected via USB

# Getting Started
Download the ChronoSense web files
Open index.html in Chrome or Edge
Click the "Connect" button and select your Microbit device
Data will automatically appear in the table and chart as it arrives

# Features
- Real-time visualization of incoming data
- Ability to select which values to display on the chart
- Adjustable time window for viewing data (1 minute to 1 hour)
- Manual or automatic data export as CSV
- Persistent storage that saves data between sessions

# Command-line Application Usage
The Python command-line application is ideal for long-term data collection or headless operation.

# Requirements
Python 3.8 or newer
PySerial library

# Installation
Install the required dependency
- pip install pyserial

# Basic Usage
- python chronoSense.py

# Specify a serial port
- python chronoSense.py --port COM3                 # Windows
- python chronoSense.py --port /dev/ttyACM0         # Linux/Mac

# Customize log file location and name
- python chronoSense.py --log-dir experiment_data --prefix temperature_test

# Command Line Arguments
--port, -p: Serial port for the Microbit
--baud, -b: Baud rate (default: 115200)
--log-dir, -d: Directory to store log files (default: logs)
--prefix, -f: Prefix for log filenames (default: microbit_data)
--retries, -r: Maximum number of connection retries (default: 5)

# License
ChronoSense is provided as a free resource for educational use and may be freely distributed to support classroom science projects.
Apache License 2.0

# About
ChronoSense was developed at St. Mary's Edenderry, Co Offaly  to support hands-on STEM education across multiple disciplines. By combining affordable Microbit technology with accessible data collection tools, ChronoSense makes scientific experimentation more accessible to students.RetryClaude can make mistakes. Please double-check responses.

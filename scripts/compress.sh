#!/bin/bash

# Sometimes we just want to test the building of the package and compressing is a waste of time
if [ -z "$1" ]
then
    read -p "Build tar.gz package? (y/n) " # -n 1 -r
    SLICE=${REPLY:0:1}
else
    SLICE=${1:0:1}
fi

echo   # (optional) move to a new line
if [[ $SLICE =~ ^[Yy]$ ]]
then
    cd ./build/
    echo "Compressing"
    tar -czf ./xxx-sa1-tr-mqtt.tar.gz velocity-gateway/
    echo "Removing old files"
    rm -rf velocity-gateway
else
    echo "Skipping .tar.gz generation"
fi
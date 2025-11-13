#!/bin/bash

# Remove the build folder completely, start again
echo "Removing old build files"
rm -rf build
# Make the required directories
echo "Constructing file-system hierarchy"
mkdir -p build/velocity-gateway/logs
# Copy the src files into the package
echo "Copying plugin source files"
cp -r ./src ./build/velocity-gateway/lib
# Copy the assembly files
echo "Copying assembly files"
cp -r ./assembly/conf ./assembly/bin ./assembly/resources ./build/velocity-gateway
cp -r ./node_modules ./build/velocity-gateway

echo "Ensuring executable permissions"
chmod +x ./build/velocity-gateway/bin/gateway.sh
chmod +x ./build/velocity-gateway/bin/gatewayd.sh

# Cleanup build artifacts that aren't required for deployment
if [ -v CLEAN_BUILD ]
then
    echo "Cleaning up unnecessary build artifacts"
    rm -r ./build/velocity-gateway/resources/validation
    rm ./build/velocity-gateway/bin/gatewayd.sh
fi

# Optionally pack
. ./scripts/compress.sh $@
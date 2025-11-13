#!/bin/bash

# Resolve links - $0 may be a softlink
PRG="$0"

while [ -h "$PRG" ]; do
  ls=`ls -ld "$PRG"`
  link=`expr "$ls" : '.*-> \(.*\)$'`
  if expr "$link" : '.*/.*' > /dev/null; then
    PRG="$link"
  else
    PRG=`dirname "$PRG"`/"$link"
  fi
done

# Get standard environment variables
PRGDIR=`dirname "$PRG"`

# Only set VELOCITY_HOME if not already set
[ -z "$VELOCITY_HOME" ] && VELOCITY_HOME=`cd "$PRGDIR/.." ; pwd`

# ----- Process the input command ----------------------------------------------
args=""
for c in $*
do
    if [ "$c" = "--inspect" ]; then
        CMD="--inspect"
        continue
    elif [ "$c" = "--debug-brk" ]; then
          CMD="--debug-brk"
          continue
    elif [ "$CMD" = "--debug-brk" ]; then
          if [ -z "$PORT" ]; then
                PORT=$c
          fi
    elif [ "$c" = "--stop" ] || [ "$c" = "-stop" ] || [ "$c" = "stop" ]; then
          CMD="stop"
    elif [ "$c" = "--start" ] || [ "$c" = "-start" ] || [ "$c" = "start" ]; then
          CMD="start"
    elif [ "$c" = "--version" ] || [ "$c" = "-version" ] || [ "$c" = "version" ]; then
          CMD="version"
    else
        args="$args $c"
    fi
done

if [ "$CMD" = "--debug-brk" ]; then
  if [ "$PORT" = "" ]; then
    echo " Please specify the debug port after the --debug option"
    exit 1
  else 
       args="$args --debug=$PORT --expose_debug_as=v8debug"
  fi
elif [ "$CMD" = "start" ]; then
  #if [ -e "$RUNTIME_HOME/runtime.pid" ]; then
  #  if  ps -p $PID > /dev/null ; then
  #    echo "Process is already running"
  #    exit 0
  #  fi
  #fi
  export VELOCITY_HOME=$VELOCITY_HOME
fi

# Set log level to debug, if not already set
[ -z "$LOG_LEVEL" ] && LOG_LEVEL='debug'

# The args must precede the .js file
VELOCITY_HOME=$VELOCITY_HOME LOG_LEVEL=$LOG_LEVEL node --max-old-space-size=4096 $args $VELOCITY_HOME/lib/Cluster.js

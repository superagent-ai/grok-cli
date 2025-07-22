#!/bin/bash

# Validate that grok mcp serve works correctly
# This can be used with Claude Desktop or other MCP clients

echo "🔍 Validating grok mcp serve command..."

# Check if the command exists and is executable
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

# Check if the dist directory exists
if [ ! -d "dist" ]; then
    echo "❌ dist directory not found. Run 'npm run build' first."
    exit 1
fi

# Check if the main executable exists
if [ ! -f "dist/index.js" ]; then
    echo "❌ dist/index.js not found"
    exit 1
fi

# Test the MCP serve command
echo "✅ Starting MCP server test..."
node dist/index.js mcp serve > /dev/null 2>&1 &
count=0
while [ $count -lt 5 ]; do
    if pgrep -f "mcp serve" > /dev/null; then
        echo "✅ MCP server started successfully"
        pkill -f "mcp serve"
        exit 0
    fi
    sleep 1
    count=$((count+1))
done

echo "❌ MCP server failed to start within 5 seconds"
exit 1
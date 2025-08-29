import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { getMCPManager } from "../../ai/tools";

export function MCPStatus() {
  const [connectedServers, setConnectedServers] = useState<string[]>([]);

  useEffect(() => {
    const updateStatus = () => {
      try {
        const manager = getMCPManager();
        const servers = manager.getServers();
        setConnectedServers(servers);
      } catch {
        // MCP manager not initialized yet
        setConnectedServers([]);
      }
    };

    // Initial update with a small delay to allow MCP initialization
    const initialTimer = setTimeout(updateStatus, 2000);

    // Set up polling to check for status changes
    const interval = setInterval(updateStatus, 2000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  if (connectedServers.length === 0) {
    return null;
  }

  return (
    <Box marginLeft={1}>
      <Text color="green">⚒ mcps: {connectedServers.length} </Text>
    </Box>
  );
}

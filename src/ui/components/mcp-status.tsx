import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { getMCPManager } from "../../grok/tools";
import { MCPTool } from "../../mcp/client";

interface MCPStatusProps {}

export function MCPStatus({}: MCPStatusProps) {
  const [connectedServers, setConnectedServers] = useState<string[]>([]);
  const [availableTools, setAvailableTools] = useState<MCPTool[]>([]);

  useEffect(() => {
    const updateStatus = () => {
      try {
        const manager = getMCPManager();
        const servers = manager.getServers();
        const tools = manager.getTools();

        setConnectedServers(servers);
        setAvailableTools(tools);
      } catch (error) {
        // MCP manager not initialized yet
        setConnectedServers([]);
        setAvailableTools([]);
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

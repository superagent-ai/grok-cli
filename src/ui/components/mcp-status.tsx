import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { GrokAgent } from "../../agent/grok-agent";
import chalk from "chalk";

interface MCPStatusProps {
  agent: GrokAgent;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}

interface MCPStatusSummary {
  connectedServers: number;
  totalTools: number;
  totalResources: number;
  totalPrompts: number;
  totalRoots: number;
  serverDetails: Array<{
    id: string;
    status: string;
    toolCount: number;
    resourceCount: number;
    error?: string;
    scope?: 'project' | 'user' | 'local' | 'fallback';
  }>;
  scopeCounts: {
    project: number;
    user: number;
    local: number;
    fallback: number;
  };
}

export function MCPStatus({ agent, isExpanded, onToggleExpanded }: MCPStatusProps) {
  const [statusSummary, setStatusSummary] = useState<MCPStatusSummary>({
    connectedServers: 0,
    totalTools: 0,
    totalResources: 0,
    totalPrompts: 0,
    totalRoots: 0,
    serverDetails: [],
    scopeCounts: { project: 0, user: 0, local: 0, fallback: 0 }
  });

  useEffect(() => {
    const updateStatus = async () => {
      try {
        // Access the MCP manager from the agent
        const mcpManager = (agent as any).mcpManager;
        if (!mcpManager) return;

        const serverStatuses = mcpManager.getServerStatuses();
        const allTools = mcpManager.getAllTools();
        const configManager = mcpManager.getConfigManager();
        
        // Get local MCP service for resources, prompts, and roots
        const { MCPService } = await import('../../mcp/mcp-service');
        const service = new MCPService();
        
        const [resourcesResponse, promptsResponse, rootsResponse] = await Promise.all([
          service.listResources(),
          service.listPrompts(),
          service.listRoots()
        ]);
        
        const connectedServers = Object.values(serverStatuses).filter(
          (status: any) => status.status === 'connected'
        ).length;
        
        const scopeCounts = { project: 0, user: 0, local: 0, fallback: 0 };
        
        const serverDetails = Object.values(serverStatuses).map((status: any) => {
          const scope = configManager?.getServerScope(status.id) || 'fallback';
          scopeCounts[scope]++;
          
          return {
            id: status.id,
            status: status.status,
            toolCount: status.tools?.length || 0,
            resourceCount: status.resources?.length || 0,
            error: status.error,
            scope
          };
        });

        setStatusSummary({
          connectedServers,
          totalTools: allTools.length,
          totalResources: resourcesResponse.resources.length,
          totalPrompts: promptsResponse.prompts.length,
          totalRoots: rootsResponse.roots.length,
          serverDetails,
          scopeCounts
        });
      } catch (error) {
        // Silently handle errors
      }
    };

    updateStatus();
    const interval = setInterval(updateStatus, 2000); // Update every 2 seconds
    
    return () => clearInterval(interval);
  }, [agent]);

  useInput((input, key) => {
    if (key.tab) {
      onToggleExpanded();
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'green';
      case 'connecting': return 'yellow';
      case 'error': return 'red';
      default: return 'gray';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return '✅';
      case 'connecting': return '🔄';
      case 'error': return '❌';
      default: return '⚪';
    }
  };

  const scopeDisplay = [];
  if (statusSummary.scopeCounts.project > 0) {
    scopeDisplay.push(chalk.cyan(`Project:${statusSummary.scopeCounts.project}`));
  }
  if (statusSummary.scopeCounts.user > 0) {
    scopeDisplay.push(chalk.green(`User:${statusSummary.scopeCounts.user}`));
  }
  if (statusSummary.scopeCounts.local > 0) {
    scopeDisplay.push(chalk.yellow(`Local:${statusSummary.scopeCounts.local}`));
  }
  if (statusSummary.scopeCounts.fallback > 0) {
    scopeDisplay.push(chalk.gray(`Fallback:${statusSummary.scopeCounts.fallback}`));
  }
  
  const scopeText = scopeDisplay.length > 0 ? ` (${scopeDisplay.join(' ')})` : '';
  const displayText = `${statusSummary.connectedServers} MCP Server${statusSummary.connectedServers !== 1 ? 's' : ''}${scopeText} ${statusSummary.totalTools} Tools ${statusSummary.totalResources} Resources ${statusSummary.totalPrompts} Prompts ${statusSummary.totalRoots} Roots`;
  
  const summaryText = `
${statusSummary.connectedServers} MCP Servers ${statusSummary.totalTools} Tools ${statusSummary.totalResources} Resources ${statusSummary.totalPrompts} Prompts ${statusSummary.totalRoots} Roots`;
  const compactText = `${statusSummary.connectedServers}🔧${statusSummary.totalTools}📁${statusSummary.totalResources}📝${statusSummary.totalPrompts}🏠${statusSummary.totalRoots}`;

  if (!isExpanded) {
    return (
      <Box marginBottom={1}>
        <Text>
          <Text color="magenta">{statusSummary.connectedServers}</Text>
          <Text color="cyan"> MCP Servers</Text>
          <Text>{scopeText}</Text>
          <Text color="magenta"> {statusSummary.totalTools}</Text>
          <Text color="cyan"> Tools</Text>
          <Text dimColor> (press Tab to expand or use /mcp for details)</Text>
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text>
          <Text color="magenta">{statusSummary.connectedServers}</Text>
          <Text color="cyan"> MCP Servers </Text>
          <Text color="magenta">{statusSummary.totalTools}</Text>
          <Text color="cyan"> Tools</Text>
          <Text dimColor> (press Tab to collapse)</Text>
        </Text>
      </Box>
      
      {statusSummary.serverDetails.length > 0 && (
        <Box flexDirection="column" marginTop={1} paddingLeft={2}>
          {statusSummary.serverDetails.map((server) => {
            const scopeColor = server.scope === 'project' ? 'cyan' : 
                              server.scope === 'user' ? 'green' : 
                              server.scope === 'local' ? 'yellow' : 'gray';
            
            return (
              <Box key={server.id}>
                <Text>
                  {getStatusIcon(server.status)}
                  <Text color={getStatusColor(server.status)}> {server.id}</Text>
                  <Text color={scopeColor}> [{server.scope}]</Text>
                  <Text dimColor> ({server.toolCount} tools)</Text>
                  {server.error && (
                    <Text color="red"> - {server.error}</Text>
                  )}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
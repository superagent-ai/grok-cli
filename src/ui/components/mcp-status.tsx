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
    promptCount: number;
    error?: string;
    scope?: 'project' | 'user' | 'local' | 'system';
  }>;
  scopeCounts: {
    project: number;
    user: number;
    local: number;
    system: number;
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
    scopeCounts: { project: 0, user: 0, local: 0, system: 0 }
  });
  const [mcpAvailable, setMcpAvailable] = useState(false);
  const [configuredServers, setConfiguredServers] = useState<number>(0);
  const [loadingState, setLoadingState] = useState<'checking' | 'loading' | 'ready'>('checking');
  const [loadingFrame, setLoadingFrame] = useState(0);

  useEffect(() => {
    const updateStatus = async () => {
      try {
        // Access the MCP manager from the agent
        const mcpManager = (agent as any).mcpManager;
        
        // Check for configured servers even if manager isn't ready
        if (!mcpManager) {
          setLoadingState('checking');
          setMcpAvailable(false);
          return;
        }
        
        // Get config to see how many servers should be loading
        const config = mcpManager.getConfig();
        const configManagerInstance = mcpManager.getConfigManager();
        
        // If no config yet, try to check the config files directly
        if (!config && configManagerInstance) {
          // We're still loading config
          setLoadingState('loading');
          setMcpAvailable(false);
          return;
        }
        
        if (config) {
          const enabledServerCount = Object.values(config.mcpServers)
            .filter((server: any) => server.enabled).length;
          // Only update if we have a real count, never go back to 0 once we know servers exist
          if (enabledServerCount > 0 || configuredServers === 0) {
            setConfiguredServers(enabledServerCount);
          }
        }
        
        if (!mcpManager.isInitialized()) {
          setLoadingState('loading');
          setMcpAvailable(false);
          // Keep current counts to show progress
          return;
        }
        
        setMcpAvailable(true);
        setLoadingState('ready');

        const serverStatuses = mcpManager.getServerStatuses();
        const allTools = mcpManager.getAllTools();
        const configManager = mcpManager.getConfigManager();
        
        // Get local MCP service for resources, prompts, and roots
        const { MCPService } = await import('../../mcp/mcp-service');
        const service = new MCPService();
        
        // Initialize response objects with error handling
        let resourcesResponse = { resources: [] };
        let promptsResponse = { prompts: [] };
        let rootsResponse = { roots: [] };
        
        try {
          const [resRes, promptRes, rootRes] = await Promise.allSettled([
            service.listResources(),
            service.listPrompts(),
            service.listRoots()
          ]);
          
          if (resRes.status === 'fulfilled') resourcesResponse = resRes.value;
          if (promptRes.status === 'fulfilled') promptsResponse = promptRes.value;
          if (rootRes.status === 'fulfilled') rootsResponse = rootRes.value;
        } catch (error) {
          console.error('Error fetching MCP data:', error);
        }
        
        const connectedServers = Object.values(serverStatuses).filter(
          (status: any) => status.status === 'connected'
        ).length;
        
        const scopeCounts = { project: 0, user: 0, local: 0, system: 0 };
        
        const serverDetails = Object.values(serverStatuses).map((status: any) => {
          const scope = configManager?.getServerScope(status.id) || 'system';
          scopeCounts[scope]++;
          
          return {
            id: status.id,
            status: status.status,
            toolCount: status.tools?.length || 0,
            resourceCount: status.resources?.length || 0,
            promptCount: status.prompts?.length || 0,
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
        console.error('Error updating MCP status:', error);
        // Set empty state with error indication
        setStatusSummary(prev => ({
          ...prev,
          serverDetails: prev.serverDetails.map(server => ({
            ...server,
            error: server.error || 'Connection lost'
          }))
        }));
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
  
  // Loading animation
  useEffect(() => {
    if (loadingState === 'loading') {
      const timer = setInterval(() => {
        setLoadingFrame(f => (f + 1) % 10);
      }, 80);
      return () => clearInterval(timer);
    }
  }, [loadingState]);

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
  if (statusSummary.scopeCounts.system > 0) {
    scopeDisplay.push(chalk.gray(`System:${statusSummary.scopeCounts.system}`));
  }
  
  const scopeText = scopeDisplay.length > 0 ? ` (${scopeDisplay.join(' ')})` : '';
  
  // Enhanced display with icons and counts
  const displayText = `${statusSummary.connectedServers} MCP Server${statusSummary.connectedServers !== 1 ? 's' : ''}${scopeText} ${statusSummary.totalTools}🔧 ${statusSummary.totalResources}📁 ${statusSummary.totalPrompts}📝 ${statusSummary.totalRoots}🏠`;
  
  // Summary text for expanded view
  const summaryText = `
${statusSummary.connectedServers} MCP Servers ${statusSummary.totalTools} Tools ${statusSummary.totalResources} Resources ${statusSummary.totalPrompts} Prompts ${statusSummary.totalRoots} Roots`;
  const compactText = `${statusSummary.connectedServers}🔧${statusSummary.totalTools}📁${statusSummary.totalResources}📝${statusSummary.totalPrompts}🏠${statusSummary.totalRoots}`;

  if (!isExpanded) {
    if (!mcpAvailable) {
      if (loadingState === 'checking') {
        return (
          <Box marginBottom={1}>
            <Text color="yellow">
              ⏳ Checking MCP configuration...
            </Text>
          </Box>
        );
      } else if (loadingState === 'loading' && configuredServers > 0) {
        const loadingFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        
        return (
          <Box marginBottom={1}>
            <Text color="cyan">
              {loadingFrames[loadingFrame]} Loading {configuredServers} MCP server{configuredServers !== 1 ? 's' : ''}... 
              {statusSummary.connectedServers > 0 && (
                <Text color="green">({statusSummary.connectedServers} connected)</Text>
              )}
            </Text>
          </Box>
        );
      } else {
        // Default loading state - we don't know yet if servers are configured
        return (
          <Box marginBottom={1}>
            <Text color="yellow">
              ⏳ Loading MCP servers...
            </Text>
          </Box>
        );
      }
    }
    
    return (
      <Box marginBottom={1}>
        <Text>
          <Text color="magenta">{statusSummary.connectedServers}</Text>
          <Text color="cyan"> MCP Servers</Text>
          <Text>{scopeText}</Text>
          <Text color="magenta"> {statusSummary.totalTools}</Text>
          <Text color="cyan"> Tools</Text>
          <Text color="green"> {statusSummary.totalResources} Resources</Text>
          <Text color="yellow"> {statusSummary.totalPrompts} Prompts</Text>
          <Text color="blue"> {statusSummary.totalRoots} Roots</Text>
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
                  <Text dimColor> ({server.toolCount}🔧 {server.resourceCount}📁 {server.promptCount}📝)</Text>
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
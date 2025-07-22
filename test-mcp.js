#!/usr/bin/env node

const { MCPManager } = require('./dist/mcp/manager');
const { MCPConfigManager } = require('./dist/mcp/config');

async function testMCPConnectivity() {
  console.log('🧪 Testing MCP Connectivity...\n');
  
  try {
    const configManager = new MCPConfigManager();
    const manager = new MCPManager(configManager);
    
    console.log('📋 Loading MCP configuration...');
    await configManager.loadConfig();
    
    console.log('🔗 Connecting to enabled servers...');
    await manager.initialize();
    
    const statuses = manager.getServerStatuses();
    console.log('\n📊 Server Statuses:');
    
    Object.entries(statuses).forEach(([serverId, status]) => {
      const emoji = status.status === 'connected' ? '✅' : '❌';
      console.log(`  ${emoji} ${serverId}: ${status.status}`);
      if (status.error) {
        console.log(`     Error: ${status.error}`);
      }
    });
    
    const tools = manager.getAllTools();
    console.log(`\n🛠️  Available tools: ${tools.length}`);
    tools.forEach(tool => {
      console.log(`   - ${tool.name} (${tool.serverId})`);
    });
    
    await manager.shutdown();
    console.log('\n✅ MCP connectivity test completed successfully!');
    
  } catch (error) {
    console.error('❌ MCP connectivity test failed:', error.message);
    process.exit(1);
  }
}

testMCPConnectivity();
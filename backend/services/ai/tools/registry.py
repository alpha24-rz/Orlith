import logging
from typing import Dict, Any, Callable, List, Optional

logger = logging.getLogger(__name__)

class Tool:
    def __init__(self, definition: Dict[str, Any], func: Callable):
        self.definition = definition
        self.name = definition["function"]["name"]
        self.func = func

    async def execute(self, *args, **kwargs) -> Any:
        return await self.func(*args, **kwargs)

class ToolRegistry:
    def __init__(self):
        self.tools: Dict[str, Tool] = {}

    def register(self, definition: Dict[str, Any], func: Callable):
        tool = Tool(definition, func)
        self.tools[tool.name] = tool
        logger.debug(f"Registered tool: {tool.name}")

    def get_tool(self, name: str) -> Optional[Tool]:
        return self.tools.get(name)

    def get_schemas(self) -> List[Dict[str, Any]]:
        return [tool.definition for tool in self.tools.values()]

    async def execute(self, tool_name: str, *args, **kwargs) -> Any:
        tool = self.get_tool(tool_name)
        if not tool:
            return {"error": f"Tool '{tool_name}' is not registered."}
        try:
            return await tool.execute(*args, **kwargs)
        except Exception as e:
            logger.error(f"Error executing tool '{tool_name}': {e}")
            return {"error": str(e)}

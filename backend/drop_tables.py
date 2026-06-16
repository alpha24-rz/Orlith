import asyncio
from core.database import engine, Base
import models

async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        print("Tables dropped.")

asyncio.run(main())

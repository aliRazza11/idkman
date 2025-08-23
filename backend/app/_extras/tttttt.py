# import asyncio
# from sqlalchemy.ext.asyncio import create_async_engine
# from sqlalchemy import text

# DATABASE_URL = "mysql+aiomysql://root:1234@localhost:3306/diffusiondb"

# engine = create_async_engine(DATABASE_URL, echo=True)

# async def test_connection():
#     try:
#         async with engine.begin() as conn:
#             result = await conn.execute(text("SELECT 1"))
#             print("✅ Database connected successfully:", result.scalar())
#     except Exception as e:
#         print("❌ Database connection failed:", e)
#     finally:
#         await engine.dispose()  # cleanly close connection

# if __name__ == "__main__":
#     asyncio.run(test_connection())


from fastapi import Response
print(Response.__dict__)
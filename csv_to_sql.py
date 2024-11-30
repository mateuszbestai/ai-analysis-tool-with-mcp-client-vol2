import pandas
from datetime import datetime
from sqlite3 import connect


def convert_csv_to_sql(path,DB_FILENAME, TABLE_NAME):
    with connect(DB_FILENAME) as conn:
        df = pandas.read_csv(
            path,
        )
        print(df)
        print(df.info(verbose=True))
        df.to_sql(TABLE_NAME, conn, if_exists="replace", index=False)

sleep 10
FILE=/var/run/mysqld/mysqld.pid
if [ -f "$FILE" ]; then
    echo "$FILE exists."
else
    echo "$FILE not found"
fi
sleep 5
FILE_DB=/var/lib/mysql/db/mwg8_actor.ibd
if [ -f "$FILE_DB" ]; then
    echo "$FILE_DB exists."
else
    echo "$FILE_DB not found"
fi
# test


package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"sync"
)

const (
	opSet byte = 1
	opDel byte = 2
)

type DB struct {
	file  *os.File
	index map[string]int64
	mu    sync.RWMutex
}

func Open(path string) (*DB, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return nil, err
	}

	db := &DB{
		file:  file,
		index: make(map[string]int64),
	}

	if err := db.loadIndex(); err != nil {
		return nil, err
	}

	return db, nil
}

func (db *DB) loadIndex() error {
	var offset int64 = 0

	for {
		header := make([]byte, 9)
		_, err := db.file.ReadAt(header, offset)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil
		}

		op := header[0]
		keyLen := binary.BigEndian.Uint32(header[1:5])
		valLen := binary.BigEndian.Uint32(header[5:9])

		key := make([]byte, keyLen)
		_, err = db.file.ReadAt(key, offset+9)
		if err != nil {
			return err
		}

		if op == opSet {
			db.index[string(key)] = offset
		} else if op == opDel {
			delete(db.index, string(key))
		}

		offset += 9 + int64(keyLen) + int64(valLen)
	}
	return nil
}

func (db *DB) Set(key, value string) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	keyBytes := []byte(key)
	valBytes := []byte(value)

	record := make([]byte, 9+len(keyBytes)+len(valBytes))
	record[0] = opSet
	binary.BigEndian.PutUint32(record[1:5], uint32(len(keyBytes)))
	binary.BigEndian.PutUint32(record[5:9], uint32(len(valBytes)))

	copy(record[9:], keyBytes)
	copy(record[9+len(keyBytes):], valBytes)

	offset, _ := db.file.Seek(0, io.SeekEnd)
	_, err := db.file.Write(record)
	if err != nil {
		return err
	}

	db.index[key] = offset
	return nil
}

func (db *DB) Get(key string) (string, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	offset, ok := db.index[key]
	if !ok {
		return "", errors.New("not found")
	}

	header := make([]byte, 9)
	_, err := db.file.ReadAt(header, offset)
	if err != nil {
		return "", err
	}

	keyLen := binary.BigEndian.Uint32(header[1:5])
	valLen := binary.BigEndian.Uint32(header[5:9])

	value := make([]byte, valLen)
	_, err = db.file.ReadAt(value, offset+9+int64(keyLen))
	if err != nil {
		return "", err
	}

	return string(value), nil
}

func (db *DB) Delete(key string) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	keyBytes := []byte(key)

	record := make([]byte, 9+len(keyBytes))
	record[0] = opDel
	binary.BigEndian.PutUint32(record[1:5], uint32(len(keyBytes)))
	binary.BigEndian.PutUint32(record[5:9], 0)

	copy(record[9:], keyBytes)

	_, err := db.file.Seek(0, io.SeekEnd)
	if err != nil {
		return err
	}

	_, err = db.file.Write(record)
	if err != nil {
		return err
	}

	delete(db.index, key)
	return nil
}

func (db *DB) Close() error {
	return db.file.Close()
}

//
// 🚀 SERVER ENTRYPOINT
//

func main() {
	if len(os.Args) != 2 || os.Args[1] != "serve" {
		fmt.Println("Usage: kv serve")
		return
	}

	db, err := Open("data.kv")
	if err != nil {
		panic(err)
	}
	defer db.Close()

	startServer(db)
}

func startServer(db *DB) {
	listener, err := net.Listen("tcp", ":6379")
	if err != nil {
		panic(err)
	}

	fmt.Println("KV server running on :6379")

	for {
		conn, err := listener.Accept()
		if err != nil {
			continue
		}
		go handleConnection(conn, db)
	}
}

func handleConnection(conn net.Conn, db *DB) {
	defer conn.Close()

	buffer := make([]byte, 4096)

	for {
		n, err := conn.Read(buffer)
		if err != nil {
			return
		}

		input := strings.TrimSpace(string(buffer[:n]))
		parts := strings.SplitN(input, " ", 3)

		if len(parts) == 0 {
			conn.Write([]byte("ERR invalid command\n"))
			continue
		}

		cmd := strings.ToUpper(parts[0])

		switch cmd {
		case "SET":
			if len(parts) != 3 {
				conn.Write([]byte("ERR usage: SET key value\n"))
				continue
			}
			err := db.Set(parts[1], parts[2])
			if err != nil {
				conn.Write([]byte("ERR\n"))
				continue
			}
			conn.Write([]byte("OK\n"))

		case "GET":
			if len(parts) != 2 {
				conn.Write([]byte("ERR usage: GET key\n"))
				continue
			}
			val, err := db.Get(parts[1])
			if err != nil {
				conn.Write([]byte("NULL\n"))
				continue
			}
			conn.Write([]byte(val + "\n"))

		case "DEL":
			if len(parts) != 2 {
				conn.Write([]byte("ERR usage: DEL key\n"))
				continue
			}
			err := db.Delete(parts[1])
			if err != nil {
				conn.Write([]byte("ERR\n"))
				continue
			}
			conn.Write([]byte("OK\n"))

		default:
			conn.Write([]byte("ERR unknown command\n"))
		}
	}
}

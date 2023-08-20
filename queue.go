package main

import (
	"errors"
	"sync"
)

type CmdQueueItem struct {
	cmd    string
	column int
}

type CmdQueue struct {
	mu       sync.Mutex
	capacity int
	q        []CmdQueueItem
}

// Insert inserts the item onto the end of the queue
func (q *CmdQueue) Insert(item CmdQueueItem) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.q) < int(q.capacity) {
		q.q = append(q.q, item)
		return nil
	}
	return errors.New("CmdQueue is full")
}

// Remove removes the oldest element from the queue
func (q *CmdQueue) Remove() (CmdQueueItem, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.q) > 0 {
		item := q.q[0]
		q.q = q.q[1:]
		return item, nil
	}
	return CmdQueueItem{}, errors.New("Queue is empty")
}

// NewCmdQueue creates an empty queue with desired capacity
func NewCmdQueue(capacity int) *CmdQueue {
	return &CmdQueue{
		capacity: capacity,
		q:        make([]CmdQueueItem, 0, capacity),
	}
}

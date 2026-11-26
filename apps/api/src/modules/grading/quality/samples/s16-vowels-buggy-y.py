line = input().lower()
print(sum(line.count(v) for v in "aeiouy"))

# preberemo stevilo in ga spremenimo v pozitivno
n = int(input())
if n < 0:
    n = -n
vsota = 0
for c in str(n):
    vsota = vsota + int(c)
print(vsota)

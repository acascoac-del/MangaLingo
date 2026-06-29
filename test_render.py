import cv2
import numpy as np
import os
import sys

# mock
class Region:
    def __init__(self):
        self.translation = "MIRAGE SAN, LA PRINCESA ESTA LLAMANDO"
        self.font_size = 50

region = Region()
words = region.translation.split()
font_size = region.font_size
stroke_width = 0.05
delimiter_len = int(font_size * 0.5)

def calculate_font_values(font_size, words):
    font_size = int(font_size)
    sw = int(font_size * stroke_width)
    line_height = int(font_size * 0.8)
    delimiter_len = int(font_size * 0.5)
    base_length = -1
    word_lengths = []
    for word in words:
        word_length = len(word) * int(font_size * 0.6) # approximation
        word_lengths.append(word_length)
        if word_length > base_length:
            base_length = word_length
    return font_size, sw, line_height, delimiter_len, base_length, word_lengths

font_size, sw, line_height, delimiter_len, base_length, word_lengths = calculate_font_values(font_size, words)

line_width = sum(word_lengths) + delimiter_len * (len(word_lengths) - 1)
region_area = line_width * line_height + delimiter_len * (len(words) - 1) * line_height

print(f"Initial font_size: {font_size}")
print(f"line_width: {line_width}, line_height: {line_height}")
print(f"region_area: {region_area}")

# let's assume ballon area is 200x200 = 40000
ballon_area = 40000
area_ratio = ballon_area / region_area
print(f"ballon_area: {ballon_area}")
print(f"area_ratio: {area_ratio}")

area_multiplier = np.sqrt(area_ratio / 2.0)
print(f"area_multiplier: {area_multiplier}")

lines_needed = len(region.translation) / len(words[0]) if len(words[0]) > 0 else 1
lines_available = 200 // line_height + 1

region_w = 200
font_size_multiplier = max(min(region_w / (base_length + 2*sw), lines_available / lines_needed, area_multiplier), 0.2)
print(f"lines_available: {lines_available}, lines_needed: {lines_needed}")
print(f"region_w constraint: {region_w / (base_length + 2*sw)}")
print(f"lines constraint: {lines_available / lines_needed}")
print(f"font_size_multiplier: {font_size_multiplier}")

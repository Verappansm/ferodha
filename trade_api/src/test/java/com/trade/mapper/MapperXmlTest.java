package com.trade.mapper;

import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.ResultMap;
import org.apache.ibatis.mapping.ResultMapping;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

// Builds every mapper XML the way MyBatis does at startup, with no database,
// then checks each constructor result map against the class it builds: the
// constructor with exactly the declared argument types must exist. MyBatis
// only looks for it when it maps the first row, so a mismatch - `long` is
// MyBatis's alias for java.lang.Long, `_long` is the primitive - would
// otherwise pass the build and fail at run time, on the first query.
class MapperXmlTest {

    private static final Path MAPPERS = Path.of("src", "main", "resources", "mapper");

    @Test
    void everyMapperParsesAndEveryConstructorResultMapMatchesItsClass() throws IOException {
        Configuration configuration = new Configuration();
        configuration.setMapUnderscoreToCamelCase(true);
        List<Path> files;
        try (Stream<Path> listing = Files.list(MAPPERS)) {
            files = listing.filter(p -> p.toString().endsWith(".xml")).sorted().toList();
        }
        assertFalse(files.isEmpty(), "no mapper XML found under " + MAPPERS.toAbsolutePath());
        for (Path file : files) {
            try (InputStream xml = Files.newInputStream(file)) {
                new XMLMapperBuilder(xml, configuration, file.toString(), configuration.getSqlFragments()).parse();
            }
        }

        List<String> problems = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Object entry : configuration.getResultMaps()) {
            if (!(entry instanceof ResultMap resultMap) || !seen.add(resultMap.getId())) {
                continue;
            }
            List<ResultMapping> args = resultMap.getConstructorResultMappings();
            if (args.isEmpty()) {
                continue;
            }
            Class<?>[] types = args.stream().map(ResultMapping::getJavaType).toArray(Class<?>[]::new);
            try {
                resultMap.getType().getDeclaredConstructor(types);
            } catch (NoSuchMethodException e) {
                problems.add(resultMap.getId() + ": no constructor " + resultMap.getType().getSimpleName()
                        + java.util.Arrays.toString(types));
            }
        }
        assertEquals(List.of(), problems);
    }
}

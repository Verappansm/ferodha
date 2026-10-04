package com.trade.pricing.generator.mapper;

import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.io.Resources;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.InputStream;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

// Builds each mapper XML the way MyBatis does at startup, with no database:
// an unresolvable type handler or a malformed result map fails here, in the
// build, instead of crashing the service on boot.
class MapperXmlTest {

    @ParameterizedTest
    @ValueSource(strings = {"mapper/CandlePersistenceMapper.xml", "mapper/MinuteBarMapper.xml", "mapper/PollableSymbolMapper.xml"})
    void parses(String resource) {
        Configuration configuration = new Configuration();
        configuration.setMapUnderscoreToCamelCase(true);
        assertDoesNotThrow(() -> {
            try (InputStream xml = Resources.getResourceAsStream(resource)) {
                new XMLMapperBuilder(xml, configuration, resource, configuration.getSqlFragments()).parse();
            }
        });
    }
}
